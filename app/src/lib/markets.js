// Kelompok pasar yang dipakai jurnal: Gold (XAU), Forex, Crypto. Simbol lain hanya masuk "Semua".
export const MARKETS = [
  ['all', 'Semua'], ['gold', 'Gold'], ['forex', 'Forex'], ['crypto', 'Crypto'],
]
export const MARKET_SUB = { all: 'Semua pasar', gold: 'XAU', forex: 'Pasangan mata uang', crypto: 'Futures' }
export const MARKET_ICON = {
  all: 'M4 19.5h16M7 16v-5M12 16V6.5M17 16v-8',
  gold: 'M3.5 18.5h17l-2.5-6.5H6zM8 12l1.6-4.5h4.8L16 12',
  forex: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM3.5 12h17M12 3.5c2.4 2.3 3.5 5.1 3.5 8.5s-1.1 6.2-3.5 8.5c-2.4-2.3-3.5-5.1-3.5-8.5s1.1-6.2 3.5-8.5z',
  crypto: 'M9 5.5h5.5a3 3 0 0 1 0 6H9zM9 11.5h6.5a3 3 0 0 1 0 6H9zM9 3.5v17M12.5 3.5v2M12.5 18.5v2M7 5.5h2M7 17.5h2',
  other: 'M5 12h.01M12 12h.01M19 12h.01',
}

const CRYPTO = /^(1000|BTC|ETH|XRP|LTC|BCH|SOL|ADA|DOGE|DOT|BNB|AVAX|LINK|MATIC|POL|TRX|XLM|SHIB|TON|UNI|ATOM|NEAR|APT|ARB|OP|PEPE|SUI|RENDER|WIF|FET|INJ|SEI|TIA|ORDI|FIL|ETC|AAVE)/
const FIAT = new Set(['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'AUD', 'NZD', 'CAD', 'SGD', 'HKD', 'NOK', 'SEK', 'DKK', 'ZAR', 'MXN', 'TRY', 'PLN', 'CNH', 'HUF', 'CZK', 'THB', 'IDR'])

export function market(symbol = '') {
  const s = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (s.startsWith('XAU') || s.startsWith('GOLD')) return 'gold'
  if (/(USDT|USDC|BUSD|FDUSD)$/.test(s) || CRYPTO.test(s)) return 'crypto'
  if (FIAT.has(s.slice(0, 3)) && FIAT.has(s.slice(3, 6))) return 'forex'
  return 'other'
}
export const marketLabel = (k) => (MARKETS.find((m) => m[0] === k) || [k, 'Lainnya'])[1]
