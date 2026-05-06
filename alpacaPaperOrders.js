/**
 * Alpaca paper trading — market orders by USD notional when supported.
 */

function alpacaHeaders() {
  const key = process.env.ALPACA_API_KEY?.trim();
  const secret = process.env.ALPACA_SECRET_KEY?.trim();
  if (!key || !secret) throw new Error("Alpaca paper keys not configured");
  return {
    "APCA-API-KEY-ID": key,
    "APCA-API-SECRET-KEY": secret,
    "Content-Type": "application/json",
  };
}

function tradingBase() {
  return (
    process.env.ALPACA_TRADING_URL?.trim() ||
    "https://paper-api.alpaca.markets"
  ).replace(/\/$/, "");
}

/** Map dashboard ticker → Alpaca crypto/stock symbol */
export function alpacaSymbolForTicker(ticker) {
  const t = String(ticker).toUpperCase();
  if (t === "BTC") return "BTCUSD";
  if (t === "ETH") return "ETHUSD";
  return t;
}

/**
 * @param {object} opts
 * @param {string} opts.ticker — TSLA, AAPL, BTC, ETH
 * @param {number} opts.usd — notional USD
 * @param {'buy'|'sell'} opts.side
 */
export async function alpacaPaperMarketNotional({ ticker, usd, side }) {
  const symbol = alpacaSymbolForTicker(ticker);
  const url = `${tradingBase()}/v2/orders`;
  const body = {
    symbol,
    side,
    type: "market",
    time_in_force: "day",
    notional: String(Math.max(1, Number(usd).toFixed(2))),
  };

  const res = await fetch(url, {
    method: "POST",
    headers: alpacaHeaders(),
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let json = {};
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }

  if (!res.ok) {
    throw new Error(
      `Alpaca ${res.status}: ${json.message || json.error || text}`,
    );
  }
  return json;
}
