import { withRetry } from "./yahooRetry.js";

export async function fetchTwelveData5mCloses(symbol) {
  const apiKey = process.env.TWELVE_DATA_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("TWELVE_DATA_API_KEY not set");
  }

  const sym = String(symbol).trim().toUpperCase();
  const outputsize = Number(process.env.TWELVE_DATA_OUTPUT_SIZE ?? 5000);

  const url =
    `https://api.twelvedata.com/time_series` +
    `?symbol=${encodeURIComponent(sym)}` +
    `&interval=5min` +
    `&outputsize=${outputsize}` +
    `&apikey=${encodeURIComponent(apiKey)}`;

  const json = await withRetry(async () => {
    const res = await fetch(url);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(`Twelve Data ${res.status}: ${JSON.stringify(body)}`);
    }
    if (body.status === "error") {
      throw new Error(body.message || "Twelve Data error");
    }
    return body;
  }, 3, 600, "Twelve Data");

  const values = json.values;
  if (!Array.isArray(values) || values.length === 0) return [];

  return values
    .slice()
    .sort(
      (a, b) =>
        new Date(a.datetime).getTime() - new Date(b.datetime).getTime(),
    )
    .map((row) => Number(row.close))
    .filter((c) => Number.isFinite(c));
}
