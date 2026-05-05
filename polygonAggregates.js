/**
 * Polygon aggregates → ascending close prices (5m bars).
 * https://polygon.io/docs/stocks/get_v2_aggs_ticker__stocksticker__range__multiplier__timespan__from__to
 */

import { withRetry } from "./yahooRetry.js";

function calendarRangeDays(daysBack) {
  const to = new Date();
  const from = new Date(to.getTime() - daysBack * 24 * 60 * 60 * 1000);
  const iso = (d) => d.toISOString().slice(0, 10);
  return { from: iso(from), to: iso(to) };
}

/** @returns {Promise<number[]>} closes, oldest → newest */
export async function fetchPolygon5mCloses(symbol) {
  const apiKey = process.env.POLYGON_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("POLYGON_API_KEY not set");
  }

  const ticker = String(symbol).trim().toUpperCase();
  const { from, to } = calendarRangeDays(
    Number(process.env.POLYGON_RANGE_DAYS || 8),
  );

  const url =
    `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(ticker)}` +
    `/range/5/minute/${from}/${to}?adjusted=true&sort=asc&limit=50000` +
    `&apiKey=${encodeURIComponent(apiKey)}`;

  const json = await withRetry(async () => {
    const res = await fetch(url);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        `Polygon ${res.status}: ${body?.error ?? body?.message ?? JSON.stringify(body)}`,
      );
    }
    if (body.status === "ERROR" || body.error) {
      throw new Error(`Polygon: ${body.error ?? JSON.stringify(body)}`);
    }
    return body;
  }, 3, 500, "Polygon aggregates");

  const results = json.results;
  if (!Array.isArray(results) || results.length === 0) {
    return [];
  }

  return results
    .map((bar) => bar.c)
    .filter((v) => v != null && Number.isFinite(Number(v)))
    .map(Number);
}
