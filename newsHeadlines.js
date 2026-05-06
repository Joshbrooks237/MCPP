import { withRetry } from "./yahooRetry.js";

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

/** @returns {{ title: string, source?: string }[]} */
async function finnhubHeadlines(symbol, limit = 4) {
  const token = process.env.FINNHUB_API_KEY?.trim();
  if (!token) return [];

  const lookbackH = Number(process.env.FINNHUB_NEWS_LOOKBACK_HOURS ?? 48);
  const now = Date.now();
  const fromDate = new Date(now - lookbackH * 60 * 60 * 1000);
  const toDate = new Date(now);
  const sym = String(symbol).trim().toUpperCase();

  const url =
    `https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(sym)}` +
    `&from=${isoDate(fromDate)}&to=${isoDate(toDate)}&token=${encodeURIComponent(token)}`;

  const rows = await withRetry(async () => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Finnhub ${res.status}`);
    const json = await res.json();
    return Array.isArray(json) ? json : [];
  }, 2, 600, "Finnhub headlines");

  return rows
    .filter((r) => r.headline && String(r.headline).trim())
    .sort((a, b) => (b.datetime ?? 0) - (a.datetime ?? 0))
    .slice(0, limit)
    .map((r) => ({
      title: String(r.headline).trim(),
      source: r.source || "finnhub",
    }));
}

/** @returns {{ title: string, source?: string }[]} */
async function newsApiHeadlines(query, limit = 4) {
  const key = process.env.NEWSAPI_KEY?.trim();
  if (!key) return [];

  const url =
    `https://newsapi.org/v2/everything` +
    `?q=${encodeURIComponent(query)}` +
    `&sortBy=publishedAt` +
    `&pageSize=30` +
    `&language=en` +
    `&apiKey=${encodeURIComponent(key)}`;

  const json = await withRetry(async () => {
    const res = await fetch(url);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`NewsAPI ${res.status}`);
    return body;
  }, 2, 600, "NewsAPI headlines");

  const articles = json.articles || [];
  return articles
    .filter((a) => a.title && String(a.title).trim())
    .slice(0, limit)
    .map((a) => ({
      title: String(a.title).trim(),
      source: a.source?.name || "newsapi",
    }));
}

/**
 * Last two distinct headlines for council payload (Finnhub + NewsAPI merge).
 * @param {string} ticker — display ticker e.g. TSLA, BTC
 * @param {'stock'|'crypto'} kind
 */
export async function fetchHeadlinesForAsset(ticker, kind = "stock") {
  const sym = String(ticker).trim().toUpperCase();
  let q = `${sym} stock OR ${sym}`;
  if (kind === "crypto") {
    const map = { BTC: "bitcoin", ETH: "ethereum" };
    q = `${map[sym] ?? sym} cryptocurrency`;
  }

  const [fh, na] = await Promise.all([
    kind === "stock" ? finnhubHeadlines(sym, 6) : Promise.resolve([]),
    newsApiHeadlines(q, 6),
  ]);

  const seen = new Set();
  const out = [];
  for (const row of [...fh, ...na]) {
    const k = row.title.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(row);
    if (out.length >= 2) break;
  }
  return out;
}
