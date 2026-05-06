import { withRetry } from "./yahooRetry.js";

const CG_BASE = "https://api.coingecko.com/api/v3";

function cgHeaders() {
  const key = process.env.COINGECKO_API_KEY?.trim();
  if (!key) return {};
  return { "x-cg-demo-api-key": key };
}

/** @returns {Record<string, { usd: number }>} */
export async function coingeckoSimpleUsd(ids) {
  const list = Array.isArray(ids) ? ids.join(",") : ids;
  const url =
    `${CG_BASE}/simple/price?ids=${encodeURIComponent(list)}` +
    `&vs_currencies=usd&precision=full`;

  const json = await withRetry(async () => {
    const res = await fetch(url, { headers: { ...cgHeaders() } });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`CoinGecko ${res.status}: ${t}`);
    }
    return res.json();
  }, 2, 700, "CoinGecko simple");

  return json && typeof json === "object" ? json : {};
}

/** Fear & Greed 0–100 + classification */
export async function fetchFearGreedIndex() {
  const json = await withRetry(async () => {
    const res = await fetch("https://api.alternative.me/fng/?limit=1");
    if (!res.ok) throw new Error(`F&G ${res.status}`);
    return res.json();
  }, 2, 500, "alternative.me F&G");

  const row = json?.data?.[0];
  if (!row) return null;
  return {
    value: Number(row.value),
    label: String(row.value_classification ?? ""),
    timestamp: row.timestamp ? Number(row.timestamp) * 1000 : Date.now(),
  };
}

/** BTC dominance % of total crypto market cap */
export async function fetchBtcDominance() {
  const json = await withRetry(async () => {
    const res = await fetch(`${CG_BASE}/global`, { headers: { ...cgHeaders() } });
    if (!res.ok) throw new Error(`CoinGecko global ${res.status}`);
    return res.json();
  }, 2, 700, "CoinGecko global");

  const pct = json?.data?.market_cap_percentage?.btc;
  return typeof pct === "number" ? pct : Number(pct);
}
