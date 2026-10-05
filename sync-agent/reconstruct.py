"""Rekonstruksi trade dari deal MT5.

Modul ini murni (tanpa MetaTrader5 / jaringan) supaya bisa diuji di mana saja.
Semua waktu yang masuk sudah dalam detik epoch UTC (offset server sudah dikoreksi).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone

# Konstanta MT5 (DEAL_TYPE_*, DEAL_ENTRY_*, DEAL_REASON_*)
DEAL_BUY, DEAL_SELL = 0, 1
CASHFLOW_TYPES = {
    2: "balance", 3: "credit", 4: "charge", 5: "correction", 6: "bonus",
    7: "commission", 8: "commission", 9: "commission", 10: "commission",
    11: "commission", 12: "interest", 15: "commission", 16: "dividend",
    17: "dividend", 18: "tax",
}
ENTRY_IN, ENTRY_OUT, ENTRY_INOUT, ENTRY_OUT_BY = 0, 1, 2, 3
REASON_SOURCE = {0: "desktop", 1: "mobile", 2: "web", 3: "ea"}
REASON_CLOSE = {0: "manual", 1: "manual", 2: "manual", 3: "ea", 4: "sl", 5: "tp", 6: "stop_out"}

EPS = 1e-9


def iso(ts: float) -> str:
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()


@dataclass
class Deal:
    ticket: int
    order: int
    position_id: int
    time: float  # epoch UTC
    type: int
    entry: int
    reason: int
    symbol: str
    volume: float
    price: float
    profit: float
    commission: float
    swap: float
    fee: float
    magic: int
    comment: str = ""


@dataclass
class SymbolSpec:
    point: float = 0.00001
    digits: int = 5
    tick_size: float = 0.00001
    tick_value: float = 1.0  # nilai 1 tick untuk 1 lot, dalam mata uang akun


@dataclass
class PositionHints:
    """SL/TP yang diketahui dari order history atau log posisi terbuka."""
    sl: float | None = None
    tp: float | None = None


def pip_size(symbol: str, point: float, digits: int) -> float:
    """Ukuran 1 pip menurut konvensi umum trader."""
    base = (symbol or "").upper()
    if base.startswith("XAU"):
        return 0.1
    if base.startswith("XAG"):
        return 0.01
    return point * 10 if digits in (3, 5) else point


def value_per_price(profit: float, open_price: float | None, close_price: float | None,
                    spec: "SymbolSpec", volume: float) -> float | None:
    """Nilai (mata uang akun) per 1 satuan harga untuk volume trade ini.

    Diutamakan dari hasil trade itu sendiri (selalu cocok dengan konversi broker,
    termasuk akun cent); cadangan dari tick value simbol.
    """
    if open_price is not None and close_price is not None and abs(close_price - open_price) > EPS and abs(profit) > EPS:
        return abs(profit) / abs(close_price - open_price)
    if spec.tick_size > 0 and spec.tick_value > 0:
        return spec.tick_value / spec.tick_size * volume
    return None


def deal_row(d: Deal) -> dict:
    return {
        "ticket": d.ticket, "order_ticket": d.order, "position_id": d.position_id,
        "time": iso(d.time), "type": d.type, "entry": d.entry, "reason": d.reason,
        "symbol": d.symbol or None, "volume": d.volume, "price": d.price,
        "profit": d.profit, "commission": d.commission, "swap": d.swap, "fee": d.fee,
        "magic": d.magic, "comment": d.comment or None,
    }


def cashflow_rows(deals: list[Deal]) -> list[dict]:
    rows = []
    for d in deals:
        kind = CASHFLOW_TYPES.get(d.type)
        if kind is None:
            continue
        if kind == "balance":
            kind = "deposit" if d.profit >= 0 else "withdrawal"
        rows.append({
            "ticket": d.ticket, "time": iso(d.time), "kind": kind,
            "amount": d.profit, "comment": d.comment or None,
        })
    return rows


def _wavg(items: list[tuple[float, float]]) -> float | None:
    vol = sum(v for v, _ in items)
    if vol <= EPS:
        return None
    return sum(v * p for v, p in items) / vol


def build_trade(position_deals: list[Deal], spec: SymbolSpec | None = None,
                hints: PositionHints | None = None) -> dict | None:
    """Gabungkan semua deal satu posisi menjadi satu trade.

    Mengembalikan None bila posisi belum tertutup penuh.
    """
    deals = sorted(position_deals, key=lambda d: (d.time, d.ticket))
    trading = [d for d in deals if d.type in (DEAL_BUY, DEAL_SELL)]
    ins = [d for d in trading if d.entry == ENTRY_IN]
    outs = [d for d in trading if d.entry in (ENTRY_OUT, ENTRY_OUT_BY)]
    inouts = [d for d in trading if d.entry == ENTRY_INOUT]
    if not ins and not inouts:
        return None  # deal penutupan tanpa deal pembuka di riwayat
    first = ins[0] if ins else inouts[0]
    direction = "buy" if first.type == DEAL_BUY else "sell"

    vol_in = sum(d.volume for d in ins)
    vol_out = sum(d.volume for d in outs)
    if inouts:  # posisi dibalik (netting) - anggap sebagai tutup penuh di deal reversal
        vol_out += vol_in
    if vol_in <= EPS or vol_out + 1e-6 < vol_in:
        return None

    open_price = _wavg([(d.volume, d.price) for d in ins])
    close_items = [(d.volume, d.price) for d in outs] + [(vol_in, d.price) for d in inouts]
    close_price = _wavg(close_items)
    closing = (outs + inouts)
    last = max(closing, key=lambda d: (d.time, d.ticket))

    profit = sum(d.profit for d in trading)
    commission = sum(d.commission for d in trading)
    swap = sum(d.swap for d in trading)
    fee = sum(d.fee for d in trading)
    net = profit + commission + swap + fee

    spec = spec or SymbolSpec()
    sign = 1 if direction == "buy" else -1
    points = pips = None
    if open_price is not None and close_price is not None and spec.point > 0:
        points = round((close_price - open_price) * sign / spec.point, 1)
        pips = round((close_price - open_price) * sign / pip_size(first.symbol, spec.point, spec.digits), 1)

    sl = hints.sl if hints and hints.sl else None
    tp = hints.tp if hints and hints.tp else None
    close_reason = REASON_CLOSE.get(last.reason, "other")
    if close_reason == "sl" and sl is None:
        sl = last.price  # harga eksekusi SL adalah perkiraan terbaik level SL
    if close_reason == "tp" and tp is None:
        tp = last.price  # TP dipasang/diubah setelah entry: harga eksekusinya = level TP

    risk = r_mult = None
    vpp = value_per_price(profit, open_price, close_price, spec, vol_in)
    if sl and open_price and vpp:
        dist = abs(open_price - sl)
        if dist > EPS:
            risk = round(dist * vpp, 2)
            if risk > 0:
                r_mult = round(net / risk, 2)

    return {
        "position_id": first.position_id,
        "symbol": first.symbol,
        "direction": direction,
        "volume": round(vol_in, 4),
        "open_time": iso(first.time),
        "close_time": iso(last.time),
        "open_price": open_price,
        "close_price": close_price,
        "sl": sl,
        "tp": tp,
        "profit": round(profit, 2),
        "commission": round(commission, 2),
        "swap": round(swap, 2),
        "fee": round(fee, 2),
        "net_pnl": round(net, 2),
        "points": points,
        "pips": pips,
        "duration_sec": int(last.time - first.time),
        "magic": first.magic,
        "source": REASON_SOURCE.get(first.reason, "other"),
        "close_reason": close_reason,
        "partial_closes": max(0, len(closing) - 1),
        "risk_amount": risk,
        "r_multiple": r_mult,
        "comment": first.comment or None,
    }


def group_by_position(deals: list[Deal]) -> dict[int, list[Deal]]:
    groups: dict[int, list[Deal]] = {}
    for d in deals:
        if d.type in (DEAL_BUY, DEAL_SELL) and d.position_id:
            groups.setdefault(d.position_id, []).append(d)
    return groups
