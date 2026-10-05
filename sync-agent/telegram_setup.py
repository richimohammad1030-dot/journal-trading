"""Hubungkan bot Telegram untuk rapor mingguan/bulanan (sekali saja).

1. Di Telegram, chat @BotFather -> /newbot -> ikuti langkahnya -> salin token.
2. Jalankan:  python telegram_setup.py
3. Saat diminta, buka bot kamu di Telegram dan kirim /start.
"""
import getpass
import time

import keyring
import requests

APP = "JurnalTrading"
token = getpass.getpass("Token bot dari @BotFather: ").strip()
me = requests.get(f"https://api.telegram.org/bot{token}/getMe", timeout=20).json()
if not me.get("ok"):
    raise SystemExit("Token tidak valid. Salin ulang dari @BotFather.")
name = me["result"]["username"]
print(f"Bot ditemukan: @{name}. Buka t.me/{name} di Telegram lalu kirim /start ...")

chat_id = None
for _ in range(60):
    upd = requests.get(f"https://api.telegram.org/bot{token}/getUpdates", timeout=20).json()
    for u in reversed(upd.get("result", [])):
        msg = u.get("message") or {}
        if msg.get("chat", {}).get("type") == "private":
            chat_id = str(msg["chat"]["id"])
            break
    if chat_id:
        break
    time.sleep(3)
if not chat_id:
    raise SystemExit("Belum menerima /start dalam 3 menit. Jalankan ulang skrip ini.")

keyring.set_password(APP, "telegram:token", token)
keyring.set_password(APP, "telegram:chat_id", chat_id)
requests.post(f"https://api.telegram.org/bot{token}/sendMessage",
              json={"chat_id": chat_id, "text": "Jurnal Trading tersambung. Rapor mingguan dikirim tiap Senin, rapor bulanan tiap tanggal 1, pada sync pertama hari itu."},
              timeout=20)
print("Tersambung. Pastikan [telegram] enabled = true di config.toml.")
