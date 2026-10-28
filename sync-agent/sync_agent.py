"""Sync agent Jurnal Trading: MT5 -> Supabase.

Dua mode:
- Laptop: Windows Task Scheduler (saat login + tiap 15 menit), config.toml + Windows Credential Manager.
- Cloud: GitHub Actions (.github/workflows/sync.yml). Tanpa config.toml; semua dari environment
  variable (GitHub Secrets): MT5_LOGIN, MT5_SERVER, MT5_PASSWORD, SUPABASE_EMAIL, SUPABASE_PASSWORD.
Bisa juga dijalankan manual:  python sync_agent.py
Opsi:  --full     tarik ulang seluruh riwayat (abaikan sync terakhir)
       --rechart  hitung ulang chart, MAE/MFE untuk semua trade
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
import tomllib
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests

try:
    import keyring
except Exception:  # mode cloud tidak butuh keyring
    keyring = None

from price_context import (compact, ctx_window, exec_window, excursions,
                           pick_timeframes, trend_at)
from telegram_report import maybe_send_reports
from reconstruct import (Deal, PositionHints, SymbolSpec, build_trade,
                         cashflow_rows, deal_row, group_by_position, iso)

APP = "JurnalTrading"
HERE = Path(__file__).resolve().parent
DATA_DIR = Path(os.environ.get("JURNAL_DATA_DIR") or Path(os.environ.get("LOCALAPPDATA", Path.home())) / APP)
DATA_DIR.mkdir(parents=True, exist_ok=True)
STATE_FILE = DATA_DIR / "state.json"
LOCK_FILE = DATA_DIR / "sync.lock"
LOOKBACK = timedelta(days=7)

logging.basicConfig(
    filename=DATA_DIR / "sync.log", level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
log = logging.getLogger("sync")
log.addHandler(logging.StreamHandler(sys.stdout))


# ---------------------------------------------------------------- utilitas
def load_config() -> dict:
    path = HERE / "config.toml"
    if path.exists():
        with open(path, "rb") as f:
            return tomllib.load(f)
    if os.environ.get("MT5_LOGIN"):
        return config_from_env()
    sys.exit("config.toml belum ada. Salin config.example.toml lalu jalankan setup_credentials.py")


def config_from_env() -> dict:
    """Mode cloud: satu akun, semua nilai dari environment (GitHub Secrets / variables)."""
    env = os.environ
    missing = [k for k in ("MT5_LOGIN", "MT5_SERVER", "MT5_PASSWORD", "SUPABASE_URL",
                           "SUPABASE_ANON_KEY", "SUPABASE_EMAIL", "SUPABASE_PASSWORD") if not env.get(k)]
    if missing:
        sys.exit("Environment belum lengkap: " + ", ".join(missing))
    acc = {"login": int(env["MT5_LOGIN"]), "server": env["MT5_SERVER"]}
    if env.get("MT5_LABEL"):
        acc["label"] = env["MT5_LABEL"]
    if env.get("MT5_TERMINAL_PATH"):
        acc["terminal_path"] = env["MT5_TERMINAL_PATH"]
    if env.get("MT5_SERVER_UTC_OFFSET_HOURS"):
        acc["server_utc_offset_hours"] = float(env["MT5_SERVER_UTC_OFFSET_HOURS"])
    return {"supabase": {"url": env["SUPABASE_URL"], "anon_key": env["SUPABASE_ANON_KEY"],
                         "email": env["SUPABASE_EMAIL"]},
            "accounts": [acc], "telegram": {"enabled": False}}


def secret(keyring_name: str, env_name: str | None = None) -> str | None:
    """Ambil rahasia dari environment (mode cloud) atau Windows Credential Manager (mode laptop)."""
    if env_name and os.environ.get(env_name):
        return os.environ[env_name]
    if keyring is None:
        return None
    try:
        return keyring.get_password(APP, keyring_name)
    except Exception:
        return None


def load_state() -> dict:
    try:
        return json.loads(STATE_FILE.read_text())
    except Exception:
        return {}


def save_state(state: dict) -> None:
    STATE_FILE.write_text(json.dumps(state, indent=2))


def acquire_lock() -> bool:
    try:
        if LOCK_FILE.exists() and time.time() - LOCK_FILE.stat().st_mtime < 20 * 60:
            return False
        LOCK_FILE.write_text(str(os.getpid()))
        return True
    except OSError:
        return False


# ---------------------------------------------------------------- Supabase
class Supabase:
    def __init__(self, url: str, key: str, email: str, password: str):
        self.url, self.key = url.rstrip("/"), key
        r = requests.post(
            f"{self.url}/auth/v1/token?grant_type=password",
            headers={"apikey": key, "Content-Type": "application/json"},
            json={"email": email, "password": password}, timeout=30,
        )
        if r.status_code != 200:
            raise RuntimeError(f"Login Supabase gagal: {r.status_code} {r.text}")
        self.token = r.json()["access_token"]

    def _h(self, prefer: str | None = None) -> dict:
        h = {"apikey": self.key, "Authorization": f"Bearer {self.token}",
             "Content-Type": "application/json"}
        if prefer:
            h["Prefer"] = prefer
        return h

    def upsert(self, table: str, rows: list[dict], on_conflict: str, returning=False):
        out = []
        for i in range(0, len(rows), 500):
            chunk = rows[i:i + 500]
            prefer = "resolution=merge-duplicates," + ("return=representation" if returning else "return=minimal")
            r = requests.post(f"{self.url}/rest/v1/{table}?on_conflict={on_conflict}",
                              headers=self._h(prefer), json=chunk, timeout=60)
            if r.status_code >= 300:
                raise RuntimeError(f"Upsert {table} gagal: {r.status_code} {r.text}")
            if returning:
                out.extend(r.json())
        return out

    def select(self, query: str) -> list[dict]:
        r = requests.get(f"{self.url}/rest/v1/{query}", headers=self._h(), timeout=60)
        if r.status_code >= 300:
            raise RuntimeError(f"Select gagal: {r.status_code} {r.text}")
        return r.json()

    def insert(self, table: str, row: dict, returning=False):
        r = requests.post(f"{self.url}/rest/v1/{table}",
                          headers=self._h("return=representation" if returning else "return=minimal"),
                          json=row, timeout=30)
        if r.status_code >= 300:
            raise RuntimeError(f"Insert {table} gagal: {r.status_code} {r.text}")
        return r.json()[0] if returning else None

    def patch(self, table: str, match: str, data: dict):
        r = requests.patch(f"{self.url}/rest/v1/{table}?{match}", headers=self._h("return=minimal"),
                           json=data, timeout=30)
        if r.status_code >= 300:
            raise RuntimeError(f"Update {table} gagal: {r.status_code} {r.text}")

    def delete(self, table: str, match: str):
        r = requests.delete(f"{self.url}/rest/v1/{table}?{match}", headers=self._h(), timeout=30)
        if r.status_code >= 300:
            raise RuntimeError(f"Delete {table} gagal: {r.status_code} {r.text}")


# ---------------------------------------------------------------- MT5
def server_offset(mt5, acc_cfg: dict, state_acc: dict) -> int:
    """Selisih jam server broker terhadap UTC, dalam detik."""
    if "server_utc_offset_hours" in acc_cfg:
        return int(float(acc_cfg["server_utc_offset_hours"]) * 3600)
    for sym in ("EURUSD", "XAUUSD", "GBPUSD", "BTCUSD"):
        for s in (sym, sym + "m", sym + ".", sym + "c"):
            tick = mt5.symbol_info_tick(s)
            if tick and tick.time and abs(time.time() - tick.time) < 4 * 3600 + 120:
                off = round((tick.time - time.time()) / 1800) * 1800
                state_acc["offset"] = off
                return off
    return int(state_acc.get("offset", 0))


def to_deal(d, off: int) -> Deal:
    return Deal(
        ticket=d.ticket, order=d.order, position_id=d.position_id, time=d.time - off,
        type=d.type, entry=d.entry, reason=d.reason, symbol=d.symbol, volume=d.volume,
        price=d.price, profit=d.profit, commission=d.commission, swap=d.swap,
        fee=getattr(d, "fee", 0.0), magic=d.magic, comment=d.comment,
    )


def symbol_spec(mt5, symbol: str, cache: dict) -> SymbolSpec:
    if symbol not in cache:
        info = mt5.symbol_info(symbol)
        if info is None:
            mt5.symbol_select(symbol, True)
            info = mt5.symbol_info(symbol)
        cache[symbol] = SymbolSpec(
            point=info.point, digits=info.digits,
            tick_size=info.trade_tick_size or info.point,
            tick_value=info.trade_tick_value or 0.0,
        ) if info else SymbolSpec()
    return cache[symbol]


def position_hints(mt5, pid: int, sltp_seen: dict) -> PositionHints:
    """SL/TP dari order pembuka; bila kosong, pakai SL/TP pertama yang terlihat saat posisi masih terbuka."""
    sl = tp = None
    orders = mt5.history_orders_get(position=pid) or ()
    for o in sorted(orders, key=lambda o: o.time_setup):
        if o.position_id == pid or o.ticket == pid:
            sl = sl or (o.sl or None)
            tp = tp or (o.tp or None)
            break
    seen = sltp_seen.get(str(pid))
    if seen:
        sl = sl or seen.get("sl") or None
        tp = tp or seen.get("tp") or None
    return PositionHints(sl=sl, tp=tp)


def get_rates(mt5, symbol: str, tf: str, start_utc: float, end_utc: float, off: int) -> list[tuple]:
    """Bar OHLC dalam UTC. MT5 memakai jam server, jadi rentang digeser dengan offset."""
    tf_const = getattr(mt5, f"TIMEFRAME_{tf}")
    mt5.symbol_select(symbol, True)
    a = datetime.fromtimestamp(start_utc + off, tz=timezone.utc)
    b = datetime.fromtimestamp(end_utc + off, tz=timezone.utc)
    rates = mt5.copy_rates_range(symbol, tf_const, a, b)
    if rates is None or len(rates) == 0:
        return []
    return [(int(r["time"]) - off, float(r["open"]), float(r["high"]), float(r["low"]), float(r["close"]))
            for r in rates]


def price_enrich(mt5, t: dict, spec: SymbolSpec, off: int) -> tuple[dict, list[dict]]:
    o_ts = datetime.fromisoformat(t["open_time"]).timestamp()
    c_ts = datetime.fromisoformat(t["close_time"]).timestamp()
    exec_tf, ctx_tf = pick_timeframes(t["duration_sec"])
    ex_bars = get_rates(mt5, t["symbol"], exec_tf, *exec_window(o_ts, c_ts, exec_tf), off)
    if not ex_bars:
        return {}, []
    ctx_bars = get_rates(mt5, t["symbol"], ctx_tf, *ctx_window(o_ts, c_ts, ctx_tf), off)
    # MAE/MFE paling akurat dari M1 (bila trade <= 3 hari dan data M1 tersedia)
    fine = ex_bars
    if exec_tf != "M1" and c_ts - o_ts <= 3 * 86400:
        fine = get_rates(mt5, t["symbol"], "M1", o_ts - 60, c_ts + 60, off) or ex_bars
    extra = {"mae": None, "mfe": None, "mae_amount": None, "mfe_amount": None, "mae_pips": None,
             "mfe_pips": None, "mae_r": None, "mfe_r": None, "exit_efficiency": None}
    extra.update(excursions(t, fine, spec.tick_size, spec.tick_value, spec.point, spec.digits))
    extra.update({"trend_ctx": trend_at(ctx_bars, o_ts) if ctx_bars else None,
                  "chart_tf": exec_tf, "ctx_tf": ctx_tf if ctx_bars else None})
    rows = [{"tf": exec_tf, "kind": "exec", "bars": compact(ex_bars, spec.digits)}]
    if ctx_bars:
        rows.append({"tf": ctx_tf, "kind": "ctx", "bars": compact(ctx_bars, spec.digits)})
    return extra, rows


def sync_account(mt5, sb: Supabase, acc_cfg: dict, state: dict, full: bool, rechart: bool = False) -> dict:
    login = int(acc_cfg["login"])
    server = acc_cfg["server"]
    pw = secret(f"mt5:{login}@{server}", "MT5_PASSWORD")
    if not pw:
        raise RuntimeError(f"Investor password akun {login} belum disimpan. Jalankan setup_credentials.py")

    init_kwargs = {"login": login, "password": pw, "server": server, "timeout": 60000}
    if acc_cfg.get("terminal_path"):
        init_kwargs["path"] = acc_cfg["terminal_path"]
    if not mt5.initialize(**init_kwargs):
        raise RuntimeError(f"MT5 initialize gagal: {mt5.last_error()}")

    try:
        st = state.setdefault(f"{login}@{server}", {})
        info = mt5.account_info()
        if info is None:
            raise RuntimeError(f"Tidak bisa membaca info akun: {mt5.last_error()}")
        off = server_offset(mt5, acc_cfg, st)
        is_real = info.trade_mode == getattr(mt5, "ACCOUNT_TRADE_MODE_REAL", 2)

        acc = sb.upsert("accounts", [{
            "login": login, "server": server,
            "name": acc_cfg.get("label") or info.name, "broker": info.company,
            "currency": info.currency, "leverage": info.leverage, "is_real": is_real,
            "balance": info.balance, "equity": info.equity, "margin": info.margin,
            "free_margin": info.margin_free, "server_tz_offset_min": off // 60,
        }], on_conflict="user_id,login,server", returning=True)[0]
        account_id = acc["id"]
        run = sb.insert("sync_runs", {"account_id": account_id}, returning=True)

        # --- rentang tarik data
        now_srv = datetime.now(timezone.utc) + timedelta(seconds=off) + timedelta(days=1)
        if full or not st.get("last_sync"):
            date_from = datetime(2000, 1, 1, tzinfo=timezone.utc)
        else:
            date_from = datetime.fromtimestamp(st["last_sync"], tz=timezone.utc) + timedelta(seconds=off) - LOOKBACK
        # MT5 memperlakukan waktu server sebagai UTC, jadi rentang ditulis dalam "jam server"
        raw = mt5.history_deals_get(date_from, now_srv) or ()
        deals = [to_deal(d, off) for d in raw]

        # --- posisi yang tersentuh: ambil SEMUA deal-nya (pembukaan bisa di luar rentang)
        touched = {d.position_id for d in deals if d.type in (0, 1) and d.position_id}
        open_ids = {p.ticket for p in (mt5.positions_get() or ())}
        all_pos_deals: list[Deal] = []
        for pid in touched - open_ids:
            pdeals = mt5.history_deals_get(position=pid) or ()
            all_pos_deals.extend(to_deal(d, off) for d in pdeals)
        known = {d.ticket for d in all_pos_deals}
        all_deals = all_pos_deals + [d for d in deals if d.ticket not in known]

        # --- deal mentah + cashflow
        sb.upsert("deals", [{**deal_row(d), "account_id": account_id} for d in all_deals],
                  on_conflict="account_id,ticket")
        sb.upsert("cashflows", [{**r, "account_id": account_id} for r in cashflow_rows(all_deals)],
                  on_conflict="account_id,ticket")

        # --- rekonstruksi trade
        spec_cache: dict = {}
        sltp_seen = st.setdefault("sltp_seen", {})
        trades = []
        for pid, pdeals in group_by_position(all_pos_deals).items():
            sym = pdeals[0].symbol
            t = build_trade(pdeals, symbol_spec(mt5, sym, spec_cache), position_hints(mt5, pid, sltp_seen))
            if t:
                t["account_id"] = account_id
                t["updated_at"] = iso(time.time())
                trades.append(t)
                sltp_seen.pop(str(pid), None)

        # --- konteks harga (chart, MAE/MFE, tren) hanya untuk trade yang belum diproses
        charted = st.setdefault("charted", {})
        if rechart:
            charted.clear()
        enriched, plain, bar_rows = [], [], []
        for t in trades:
            key = str(t["position_id"])
            if key in charted:
                plain.append(t)
                continue
            try:
                extra, bars = price_enrich(mt5, t, symbol_spec(mt5, t["symbol"], spec_cache), off)
            except Exception as e:  # data harga tidak tersedia tidak boleh menggagalkan sync
                log.warning("Konteks harga posisi %s gagal: %s", key, e)
                extra, bars = {}, []
            if extra:
                t.update(extra)
                enriched.append(t)
                bar_rows.extend({**b, "account_id": account_id, "position_id": t["position_id"]} for b in bars)
                charted[key] = time.time()
            else:
                plain.append(t)
        # upsert terpisah: baris dengan kolom yang sama per panggilan
        sb.upsert("trades", plain, on_conflict="account_id,position_id")
        sb.upsert("trades", enriched, on_conflict="account_id,position_id")
        for i in range(0, len(bar_rows), 40):
            sb.upsert("trade_bars", bar_rows[i:i + 40], on_conflict="account_id,position_id,kind")
        cutoff = time.time() - 30 * 86400  # trade lama tidak disentuh lagi oleh sync inkremental
        st["charted"] = {k: v for k, v in charted.items() if v > cutoff}

        # --- posisi terbuka + log SL/TP
        positions = mt5.positions_get() or ()
        sb.delete("open_positions", f"account_id=eq.{account_id}")
        pos_rows = []
        for p in positions:
            src = {0: "desktop", 1: "mobile", 2: "web", 3: "ea"}.get(p.reason, "other")
            pos_rows.append({
                "account_id": account_id, "ticket": p.ticket, "symbol": p.symbol,
                "direction": "buy" if p.type == 0 else "sell", "volume": p.volume,
                "open_time": iso(p.time - off), "open_price": p.price_open,
                "current_price": p.price_current, "sl": p.sl or None, "tp": p.tp or None,
                "profit": p.profit, "swap": p.swap, "magic": p.magic, "source": src,
            })
            prev = sltp_seen.get(str(p.ticket))
            if prev is None or prev.get("sl") != (p.sl or None) or prev.get("tp") != (p.tp or None):
                sb.insert("position_sltp_log", {"account_id": account_id, "position_id": p.ticket,
                                                "sl": p.sl or None, "tp": p.tp or None})
            if prev is None:
                sltp_seen[str(p.ticket)] = {"sl": p.sl or None, "tp": p.tp or None}
            else:  # simpan SL/TP pertama yang tidak kosong
                prev["sl"] = prev.get("sl") or p.sl or None
                prev["tp"] = prev.get("tp") or p.tp or None
        if pos_rows:
            sb.upsert("open_positions", pos_rows, on_conflict="account_id,ticket")

        floating = sum(p.profit + p.swap for p in positions)
        sb.insert("account_snapshots", {"account_id": account_id, "balance": info.balance,
                                        "equity": info.equity, "margin": info.margin,
                                        "floating": floating})

        now = datetime.now(timezone.utc).isoformat()
        sb.patch("accounts", f"id=eq.{account_id}", {"last_sync_at": now})
        sb.patch("sync_runs", f"id=eq.{run['id']}", {
            "finished_at": now, "status": "ok", "deals_count": len(all_deals),
            "trades_count": len(trades)})
        st["last_sync"] = time.time()
        acc["name"] = acc.get("name") or acc_cfg.get("label")
        log.info("Akun %s: %d deal, %d trade, %d posisi terbuka", login, len(all_deals), len(trades), len(positions))
        return acc
    finally:
        mt5.shutdown()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--full", action="store_true", help="tarik ulang seluruh riwayat")
    ap.add_argument("--rechart", action="store_true", help="hitung ulang chart, MAE/MFE untuk semua trade")
    args = ap.parse_args()

    if not acquire_lock():
        log.info("Sync lain masih berjalan, dilewati.")
        return
    failed = 0
    try:
        import MetaTrader5 as mt5
        cfg = load_config()
        sb_cfg = cfg["supabase"]
        sb_pw = secret(f"supabase:{sb_cfg['email']}", "SUPABASE_PASSWORD")
        if not sb_pw:
            sys.exit("Password Supabase belum disimpan. Jalankan setup_credentials.py")

        # tunggu koneksi internet (berguna saat baru login Windows)
        for _ in range(12):
            try:
                requests.get(sb_cfg["url"], timeout=5)
                break
            except requests.RequestException:
                time.sleep(10)

        sb = Supabase(sb_cfg["url"], sb_cfg["anon_key"], sb_cfg["email"], sb_pw)
        state = load_state()
        tg = cfg.get("telegram", {})
        tg_token = secret("telegram:token") if tg.get("enabled") else None
        tg_chat = secret("telegram:chat_id") if tg_token else None
        for acc_cfg in cfg.get("accounts", []):
            try:
                acc = sync_account(mt5, sb, acc_cfg, state, args.full or args.rechart, args.rechart)
                if tg_token and tg_chat:
                    st = state.setdefault(f"{int(acc_cfg['login'])}@{acc_cfg['server']}", {})
                    try:
                        maybe_send_reports(sb, acc, st, tg_token, tg_chat, tg.get("app_url"), log)
                    except Exception as e:  # rapor gagal tidak menggagalkan sync
                        log.warning("Rapor Telegram gagal: %s", e)
            except Exception as e:  # satu akun gagal tidak menghentikan akun lain
                failed += 1
                log.exception("Sync akun %s gagal: %s", acc_cfg.get("login"), e)
            finally:
                save_state(state)
    finally:
        LOCK_FILE.unlink(missing_ok=True)
    if failed:
        sys.exit(1)  # supaya kegagalan terlihat (merah) di GitHub Actions


if __name__ == "__main__":
    main()
