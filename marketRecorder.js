import fs from "fs";
import { getIntraday } from "./dataService.js";

export const MARKET_DATA_FILE = "./marketData.json";

function read() {
  if (!fs.existsSync(MARKET_DATA_FILE)) return {};
  const raw = JSON.parse(fs.readFileSync(MARKET_DATA_FILE, "utf8"));
  // Legacy array format → start fresh candle map on disk next write
  if (Array.isArray(raw)) return {};
  return raw && typeof raw === "object" ? raw : {};
}

function write(data) {
  fs.writeFileSync(MARKET_DATA_FILE, JSON.stringify(data, null, 2));
}

function getBucket(timestamp) {
  const FIVE_MIN = 5 * 60 * 1000;
  return Math.floor(timestamp / FIVE_MIN) * FIVE_MIN;
}

export async function recordMarket(symbol) {
  const closes = await getIntraday(symbol);
  const latest = closes.at(-1);

  const now = Date.now();
  const bucket = getBucket(now);

  const data = read();

  const sym = String(symbol).trim().toUpperCase();

  if (!data[sym]) data[sym] = {};

  if (!data[sym][bucket]) {
    data[sym][bucket] = {
      open: latest,
      high: latest,
      low: latest,
      close: latest,
      timestamp: bucket,
      volume: null,
    };
  } else {
    const candle = data[sym][bucket];

    candle.high = Math.max(candle.high, latest);
    candle.low = Math.min(candle.low, latest);
    candle.close = latest;
    if (candle.volume === undefined) candle.volume = null;
  }

  write(data);
}
