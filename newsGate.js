import { withRetry } from "./yahooRetry.js";

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

async function finnhubBlocks(symbol) {
  const token = process.env.FINNHUB_API_KEY?.trim();
  if (!token) return false;

  const lookbackH = Number(process.env.FINNHUB_NEWS_LOOKBACK_HOURS ?? 6);
  const now = Date.now();
  const fromDate = new Date(now - lookbackH * 60 * 60 * 1000);
  const toDate = new Date(now);

  const sym = String(symbol).trim().toUpperCase();
  const url =
    `https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(sym)}` +
    `&from=${isoDate(fromDate)}&to=${isoDate(toDate)}&token=${encodeURIComponent(token)}`;

  const rows = await withRetry(async () => {
    const res = await fetch(url);
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Finnhub ${res.status}: ${t}`);
    }
    const json = await res.json();
    return Array.isArray(json) ? json : [];
  }, 2, 600, "Finnhub news");

  const cutoffSec = Math.floor((now - lookbackH * 60 * 60 * 1000) / 1000);
  const recent = rows.filter(
    (r) => typeof r.datetime === "number" && r.datetime >= cutoffSec,
  );

  const minHits = Number(process.env.FINNHUB_NEWS_MIN_HITS ?? 1);
  return recent.length >= minHits;
}

async function newsApiBlocks(symbol) {
  const key = process.env.NEWSAPI_KEY?.trim();
  if (!key) return false;

  const lookbackH = Number(
    process.env.NEWSAPI_LOOKBACK_HOURS ??
      process.env.FINNHUB_NEWS_LOOKBACK_HOURS ??
      6,
  );
  const sym = String(symbol).trim().toUpperCase();
  const url =
    `https://newsapi.org/v2/everything` +
    `?q=${encodeURIComponent(`${sym} stock`)}` +
    `&sortBy=publishedAt` +
    `&pageSize=50` +
    `&language=en` +
    `&apiKey=${encodeURIComponent(key)}`;

  const json = await withRetry(async () => {
    const res = await fetch(url);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(`NewsAPI ${res.status}: ${JSON.stringify(body)}`);
    }
    return body;
  }, 2, 600, "NewsAPI");

  if (json.status !== "ok") {
    throw new Error(json.message || "NewsAPI status not ok");
  }

  const articles = json.articles || [];
  const cutoff = Date.now() - lookbackH * 60 * 60 * 1000;
  const recent = articles.filter(
    (a) => new Date(a.publishedAt).getTime() >= cutoff,
  );

  const minHits = Number(process.env.NEWSAPI_MIN_ARTICLES ?? 1);
  return recent.length >= minHits;
}

/**
 * Any configured guard can veto: Finnhub company news OR NewsAPI headline sweep.
 */
export async function shouldBlockTradeForNews(symbol) {
  try {
    if (await finnhubBlocks(symbol)) return true;
  } catch (e) {
    console.warn("[newsGate] Finnhub:", e.message);
  }

  try {
    if (await newsApiBlocks(symbol)) return true;
  } catch (e) {
    console.warn("[newsGate] NewsAPI:", e.message);
  }

  return false;
}
