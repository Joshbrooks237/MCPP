import { yahoo } from "./yahooClient.js";
import { withRetry } from "./yahooRetry.js";
import { fetchPolygon5mCloses } from "./polygonAggregates.js";
import { fetchAlpaca5mCloses } from "./alpacaBars.js";
import { fetchTwelveData5mCloses } from "./twelveDataBars.js";

const MIN_BARS_DEFAULT = 50;

function minBarsTarget() {
  const n = Number(process.env.DATA_INTRADAY_MIN_BARS);
  return Number.isFinite(n) && n > 0 ? n : MIN_BARS_DEFAULT;
}

async function getIntradayYahoo(symbol) {
  const result = await withRetry(
    () =>
      yahoo.chart(
        symbol,
        {
          interval: "5m",
          range: "5d",
        },
        { validateOptions: false },
      ),
    3,
    500,
    "Yahoo chart",
  );

  const quotes = result.quotes || [];

  return quotes
    .map((q) => q.close)
    .filter((v) => v !== null && v !== undefined && Number.isFinite(v));
}

/**
 * Massive stack order (first healthy source wins):
 * Polygon → Alpaca → Twelve Data → Yahoo
 */
export async function getIntraday(symbol) {
  const MIN_BARS = minBarsTarget();

  const attempts = [];

  if (process.env.POLYGON_API_KEY?.trim()) {
    attempts.push({
      name: "Polygon",
      fn: () => fetchPolygon5mCloses(symbol),
    });
  }

  if (
    process.env.ALPACA_API_KEY?.trim() &&
    process.env.ALPACA_SECRET_KEY?.trim()
  ) {
    attempts.push({
      name: "Alpaca",
      fn: () => fetchAlpaca5mCloses(symbol),
    });
  }

  if (process.env.TWELVE_DATA_API_KEY?.trim()) {
    attempts.push({
      name: "Twelve Data",
      fn: () => fetchTwelveData5mCloses(symbol),
    });
  }

  for (const { name, fn } of attempts) {
    try {
      const closes = await fn();
      if (closes.length >= MIN_BARS) {
        return closes;
      }
      console.warn(
        `[dataService] ${name}: only ${closes.length} bars (< ${MIN_BARS}); trying next`,
      );
    } catch (e) {
      console.warn(`[dataService] ${name} failed:`, e.message);
    }
  }

  return getIntradayYahoo(symbol);
}
