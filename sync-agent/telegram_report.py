"""Rapor mingguan/bulanan ke Telegram.

Dipanggil oleh sync_agent setelah sync selesai. Rapor sebuah periode dikirim sekali,
pada sync pertama setelah periode itu berakhir (Senin untuk mingguan, tanggal 1 untuk bulanan).
"""
from __future__ import annotations

import html
from datetime import datetime, timedelta, timezone

import requests

WIB = timezone(timedelta(hours=7))
MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus",
          "September", "Oktober", "November", "Desember"]
MON3 = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"]


# ---------------------------------------------------------------- periode
def last_completed(kind: str, now: datetime | None = None) -> tuple[datetime, datetime, str, str]:
    """(awal, akhir, kunci, label) periode terakhir yang sudah selesai, dalam WIB."""
    now = (now or datetime.now(timezone.utc)).astimezone(WIB)
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    if kind == "month":
        end = today.replace(day=1)
        start = (end - timedelta(days=1)).replace(day=1)
        return start, end, f"{start:%Y-%m}", f"{MONTHS[start.month - 1]} {start.year}"
    end = today - timedelta(days=today.weekday())  # Senin minggu ini
    start = end - timedelta(days=7)
    last = end - timedelta(days=1)
    label = f"{start.day} {MON3[start.month - 1]} – {last.day} {MON3[last.month - 1]} {last.year}"
    return start, end, f"{start:%Y-%m-%d}", label


def previous(kind: str, start: datetime) -> tuple[datetime, datetime]:
    if kind == "month":
        p_start = (start - timedelta(days=1)).replace(day=1)
        return p_start, start
    return start - timedelta(days=7), start


# ---------------------------------------------------------------- statistik
def session_of(open_iso: str) -> str:
    h = datetime.fromisoformat(open_iso).astimezone(timezone.utc).hour
    if 7 <= h < 12:
        return "London"
    if 12 <= h < 16:
        return "London–NY"
    if 16 <= h < 21:
        return "New York"
    return "Asia"


def summarize(trades: list[dict]) -> dict:
    n = len(trades)
    pnl = [float(t["net_pnl"]) for t in trades]
    gp = sum(p for p in pnl if p > 0)
    gl = -sum(p for p in pnl if p < 0)
    wins = sum(1 for p in pnl if p > 0.005)
    return {
        "n": n, "net": gp - gl, "win": wins / n if n else None,
        "pf": (gp / gl) if gl > 0 else (float("inf") if gp > 0 else None),
        "best": max(trades, key=lambda t: float(t["net_pnl"])) if trades else None,
        "worst": min(trades, key=lambda t: float(t["net_pnl"])) if trades else None,
    }


def violations(trades: list[dict]) -> dict:
    by_open = sorted(trades, key=lambda t: t["open_time"])
    by_close = sorted(trades, key=lambda t: t["close_time"])
    no_sl = sum(1 for t in trades if not t.get("sl"))
    mart = rev = 0
    for t in by_open:
        prev = [c for c in by_close if c["close_time"] <= t["open_time"]]
        if not prev:
            continue
        p = prev[-1]
        if float(p["net_pnl"]) < 0:
            if p["symbol"] == t["symbol"] and float(t["volume"]) > float(p["volume"]) * 1.4:
                mart += 1
            gap = datetime.fromisoformat(t["open_time"]) - datetime.fromisoformat(p["close_time"])
            if gap < timedelta(minutes=15):
                rev += 1
    return {"Tanpa SL": no_sl, "Martingale": mart, "Revenge trade": rev}


def worst_session(trades: list[dict]) -> tuple[str, int, float] | None:
    groups: dict[str, list[float]] = {}
    for t in trades:
        groups.setdefault(session_of(t["open_time"]), []).append(float(t["net_pnl"]))
    rows = [(k, len(v), sum(v)) for k, v in groups.items() if len(v) >= 3]
    rows.sort(key=lambda r: r[2])
    return rows[0] if rows and rows[0][2] < 0 else None


# ---------------------------------------------------------------- pesan
def money(v: float, cur: str, sign: bool = True) -> str:
    s = f"{abs(v):,.2f} {cur}"
    return ("+" if v > 0 and sign else "−" if v < 0 else "") + s


def build_message(kind: str, label: str, cur: str, acc_name: str, now_s: dict, prev_s: dict,
                  viol: dict, ws, app_url: str | None) -> str:
    e = html.escape
    word = "Mingguan" if kind == "week" else "Bulanan"
    lines = [f"<b>Rapor {word} · {e(label)}</b>", f"{e(acc_name)}", ""]
    if not now_s["n"]:
        lines.append("Tidak ada trade di periode ini.")
    else:
        icon = "🟢" if now_s["net"] >= 0 else "🔴"
        lines.append(f"{icon} <b>{money(now_s['net'], cur)}</b> dari {now_s['n']} trade")
        pf = "∞" if now_s["pf"] == float("inf") else (f"{now_s['pf']:.2f}" if now_s["pf"] is not None else "–")
        lines.append(f"Win rate {now_s['win'] * 100:.0f}% · Profit factor {pf}")
        if prev_s["n"]:
            d = now_s["net"] - prev_s["net"]
            lines.append(f"Dibanding periode sebelumnya: {money(d, cur)}")
        b, w = now_s["best"], now_s["worst"]
        lines += ["", f"Terbaik: {e(b['symbol'])} {b['direction'].upper()} {money(float(b['net_pnl']), cur)}"]
        if w is not b:
            lines.append(f"Terburuk: {e(w['symbol'])} {w['direction'].upper()} {money(float(w['net_pnl']), cur)}")
        bad = [f"{k} {v}×" for k, v in viol.items() if v]
        lines += ["", "Pelanggaran: " + (", ".join(bad) if bad else "tidak ada ✅")]
        if ws:
            lines.append(f"Sesi paling merugikan: {e(ws[0])} ({ws[1]} trade, {money(ws[2], cur)})")
    if app_url:
        lines += ["", f'<a href="{e(app_url)}#/rapor">Buka rapor lengkap</a>']
    return "\n".join(lines)


def send(token: str, chat_id: str, text: str) -> None:
    r = requests.post(f"https://api.telegram.org/bot{token}/sendMessage",
                      json={"chat_id": chat_id, "text": text, "parse_mode": "HTML",
                            "disable_web_page_preview": True}, timeout=20)
    if r.status_code != 200:
        raise RuntimeError(f"Telegram gagal: {r.status_code} {r.text}")


def fetch_trades(sb, account_id: str, start: datetime, end: datetime) -> list[dict]:
    q = (f"trades?select=symbol,direction,volume,open_time,close_time,net_pnl,sl"
         f"&account_id=eq.{account_id}&close_time=gte.{start.astimezone(timezone.utc).isoformat()}"
         f"&close_time=lt.{end.astimezone(timezone.utc).isoformat()}&order=close_time")
    return sb.select(q.replace("+", "%2B"))


def maybe_send_reports(sb, account: dict, st: dict, token: str, chat_id: str,
                       app_url: str | None, log, now: datetime | None = None) -> None:
    sent = st.setdefault("reports_sent", {})
    for kind in ("week", "month"):
        start, end, key, label = last_completed(kind, now)
        if sent.get(kind) == key:
            continue
        trades = fetch_trades(sb, account["id"], start, end)
        p_start, p_end = previous(kind, start)
        prev = fetch_trades(sb, account["id"], p_start, p_end)
        msg = build_message(kind, label, account.get("currency") or "", account.get("name") or "",
                            summarize(trades), summarize(prev), violations(trades),
                            worst_session(trades), app_url)
        send(token, chat_id, msg)
        sent[kind] = key
        log.info("Rapor %s %s terkirim ke Telegram", kind, key)
