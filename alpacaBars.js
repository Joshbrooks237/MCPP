import { withRetry } from "./yahooRetry.js";

export async function fetchAlpaca5mCloses(symbol) {
  const key = process.env.ALPACA_API_KEY?.trim();
  const secret = process.env.ALPACA_SECRET_KEY?.trim();
  if (!key || !secret) {
    throw new Error("Alpaca keys not set");
  }

  const base = (
    process.env.ALPACA_DATA_URL?.trim() || "https://data.alpaca.markets"
  ).replace(/\/$/, "");
  const sym = String(symbol).trim().toUpperCase();
  const days = Number(process.env.ALPACA_RANGE_DAYS ?? 8);
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  const feed = process.env.ALPACA_DATA_FEED?.trim() || "iex";

  const url =
    `${base}/v2/stocks/${encodeURIComponent(sym)}/bars` +
    `?timeframe=5Min` +
    `&start=${encodeURIComponent(start.toISOString())}` +
    `&end=${encodeURIComponent(end.toISOString())}` +
    `&limit=10000` +
    `&adjustment=all` +
    `&feed=${encodeURIComponent(feed)}`;

  const json = await withRetry(async () => {
    const res = await fetch(url, {
      headers: {
        "APCA-API-KEY-ID": key,
        "APCA-API-SECRET-KEY": secret,
      },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(`Alpaca ${res.status}: ${JSON.stringify(body)}`);
    }
    return body;
  }, 3, 600, "Alpaca bars");

  const bars = json.bars || [];
  if (!Array.isArray(bars) || bars.length === 0) return [];

  return bars
    .slice()
    .sort((a, b) => Number(a.t) - Number(b.t))
    .map((b) => Number(b.c))
    .filter((c) => Number.isFinite(c));
}
