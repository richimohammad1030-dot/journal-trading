"""Konteks harga per trade: pemilihan timeframe chart, MAE/MFE, efisiensi exit, dan tren.

Modul murni (tanpa MetaTrader5). Bar = (epoch_utc, open, high, low, close).
"""
from __future__ import annotations

from datetime import datetime

from reconstruct import SymbolSpec, pip_size, value_per_price

TFS = [("M1", 60), ("M5", 300), ("M15", 900), ("H1", 3600), ("H4", 14400), ("D1", 86400)]
TF_SEC = dict(TFS)
MAX_EXEC_BARS_IN_TRADE = 120


def pick_timeframes(duration_sec: int) -> tuple[str, str]:
    """Timeframe eksekusi: yang terkecil di mana trade memakan <= 120 bar. Konteks: satu tingkat di atasnya."""
    names = [n for n, _ in TFS]
    exec_tf = names[-1]
    for name, sec in TFS:
        if max(duration_sec, 1) / sec <= MAX_EXEC_BARS_IN_TRADE:
            exec_tf = name
            break
    i = names.index(exec_tf)
    return exec_tf, names[min(i + 1, len(names) - 1)]


def exec_window(open_ts: float, close_ts: float, tf: str) -> tuple[float, float]:
    sec = TF_SEC[tf]
    dur = max(close_ts - open_ts, sec)
    before = max(40 * sec, 0.6 * dur)
    after = max(20 * sec, 0.3 * dur)
    return open_ts - before, close_ts + after


def ctx_window(open_ts: float, close_ts: float, tf: str) -> tuple[float, float]:
    sec = TF_SEC[tf]
    return open_ts - 120 * sec, close_ts + 10 * sec


def excursions(trade: dict, bars: list[tuple], tick_size: float, tick_value: float,
               point: float, digits: int) -> dict:
    """MAE/MFE dari bar yang berada di dalam durasi trade (bar M1 bila tersedia)."""
    o_ts = datetime.fromisoformat(trade["open_time"]).timestamp()
    c_ts = datetime.fromisoformat(trade["close_time"]).timestamp()
    step = (bars[1][0] - bars[0][0]) if len(bars) > 1 else 60
    inside = [b for b in bars if b[0] + step > o_ts and (b[0] < c_ts or b[0] <= o_ts)]
    if not inside or trade.get("open_price") is None:
        return {}
    op, cp = float(trade["open_price"]), float(trade["close_price"])
    hi = max(b[2] for b in inside)
    lo = min(b[3] for b in inside)
    # Harga eksekusi selalu termasuk rentang (mis. SL kena oleh spread di luar bar bid)
    hi, lo = max(hi, op, cp), min(lo, op, cp)
    buy = trade["direction"] == "buy"
    mfe = (hi - op) if buy else (op - lo)
    mae = (op - lo) if buy else (hi - op)
    captured = (cp - op) if buy else (op - cp)
    vol = float(trade["volume"])

    spec = SymbolSpec(point=point, digits=digits, tick_size=tick_size, tick_value=tick_value)
    vpp = value_per_price(float(trade.get("profit") or 0), op, cp, spec, vol)
    pip = pip_size(trade.get("symbol", ""), point, digits) if point > 0 else None

    def amount(d):
        return round(d * vpp, 2) if vpp else None

    def pips(d):
        return round(d / pip, 1) if pip else None

    out = {
        "mae": round(mae, 6), "mfe": round(mfe, 6),
        "mae_amount": amount(mae), "mfe_amount": amount(mfe),
        "mae_pips": pips(mae), "mfe_pips": pips(mfe),
        "exit_efficiency": round(captured / mfe, 3) if mfe > 0 else None,
    }
    risk = trade.get("risk_amount")
    if risk and out["mae_amount"] is not None:
        out["mae_r"] = round(out["mae_amount"] / risk, 2)
        out["mfe_r"] = round(out["mfe_amount"] / risk, 2)
    else:
        out["mae_r"] = out["mfe_r"] = None
    return out


def ema(values: list[float], n: int) -> list[float]:
    k = 2 / (n + 1)
    out, e = [], None
    for v in values:
        e = v if e is None else v * k + e * (1 - k)
        out.append(e)
    return out


def trend_at(ctx_bars: list[tuple], open_ts: float, n: int = 50) -> str | None:
    """Tren di timeframe konteks saat entry: harga vs EMA50 dan kemiringan EMA."""
    hist = [b for b in ctx_bars if b[0] <= open_ts]
    if len(hist) < n // 2:
        return None
    closes = [b[4] for b in hist]
    e = ema(closes, n)
    slope = e[-1] - e[-6] if len(e) > 6 else 0
    if closes[-1] > e[-1] and slope > 0:
        return "up"
    if closes[-1] < e[-1] and slope < 0:
        return "down"
    return "flat"


def compact(bars: list[tuple], digits: int) -> list[list]:
    return [[int(b[0]), round(b[1], digits), round(b[2], digits), round(b[3], digits), round(b[4], digits)] for b in bars]
