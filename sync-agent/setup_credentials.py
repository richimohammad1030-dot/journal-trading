"""Simpan password ke Windows Credential Manager (sekali saja, atau saat password berubah)."""
import getpass
import tomllib
from pathlib import Path

import keyring

APP = "JurnalTrading"
cfg = tomllib.loads((Path(__file__).parent / "config.toml").read_text(encoding="utf-8"))

email = cfg["supabase"]["email"]
pw = getpass.getpass(f"Password login jurnal untuk {email}: ")
keyring.set_password(APP, f"supabase:{email}", pw)

for acc in cfg.get("accounts", []):
    key = f"mt5:{int(acc['login'])}@{acc['server']}"
    pw = getpass.getpass(f"INVESTOR password MT5 akun {acc['login']} ({acc['server']}): ")
    keyring.set_password(APP, key, pw)

print("Tersimpan di Windows Credential Manager. Coba jalankan:  python sync_agent.py --full")
