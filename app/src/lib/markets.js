// Klasifikasi simbol ke kelompok pasar (berdasarkan nama simbol broker)
export const MARKETS = [
  ['all', 'Semua'], ['forex', 'Forex'], ['crypto', 'Crypto'], ['indices', 'Indeks'], ['commodities', 'Komoditas'],
]
export const MARKET_ICON = {
  all: 'M4 19.5h16M7 16v-5M12 16V6.5M17 16v-8',
  forex: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM3.5 12h17M12 3.5c2.4 2.3 3.5 5.1 3.5 8.5s-1.1 6.2-3.5 8.5c-2.4-2.3-3.5-5.1-3.5-8.5s1.1-6.2 3.5-8.5z',
  crypto: 'M9 5.5h5.5a3 3 0 0 1 0 6H9zM9 11.5h6.5a3 3 0 0 1 0 6H9zM9 3.5v17M12.5 3.5v2M12.5 18.5v2M7 5.5h2M7 17.5h2',
  indices: 'M4 19.5h16M6.5 15.5l4-4.5 3 3 5-6.5M15 7.5h3.5V11',
  commodities: 'M6.5 10 4 19.5h16L17.5 10zM9 10V7.5a3 3 0 0 1 6 0V10',
}

const CRYPTO = /^(BTC|ETH|XRP|LTC|BCH|SOL|ADA|DOGE|DOT|BNB|AVAX|LINK|MATIC|TRX|XLM|SHIB|TON|UNI|ATOM|NEAR|APT|ARB|OP|PEPE|SUI)/
const COMMOD = /^(XAU|XAG|XPT|XPD|GOLD|SILVER|USOIL|UKOIL|WTI|BRENT|XBR|XTI|XNG|NGAS|OIL|COPPER|XCU|NATGAS)/
const INDEX = /^(US30|US500|US100|USTEC|NAS|SPX|SP500|DJ|DE30|DE40|GER|UK100|FTSE|JP225|JPN|NIKKEI|HK50|HSI|AUS200|FR40|EU50|STOXX|CN50|IN50|VIX|DXY|USDX)/
const FIAT = new Set(['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'AUD', 'NZD', 'CAD', 'SGD', 'HKD', 'NOK', 'SEK', 'DKK', 'ZAR', 'MXN', 'TRY', 'PLN', 'CNH', 'HUF', 'CZK', 'THB', 'IDR'])

export function market(symbol = '') {
  const s = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (CRYPTO.test(s) || s.includes('USDT')) return 'crypto'
  if (COMMOD.test(s)) return 'commodities'
  if (INDEX.test(s)) return 'indices'
  if (FIAT.has(s.slice(0, 3)) && FIAT.has(s.slice(3, 6))) return 'forex'
  return /^\d|^[A-Z]{2}\d/.test(s) ? 'indices' : 'forex'
}
export const marketLabel = (k) => (MARKETS.find((m) => m[0] === k) || [k, k])[1]
