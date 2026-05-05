import fs from "fs";
import { MARKET_DATA_FILE } from "./marketRecorder.js";

/** Sorted OHLC candles for `symbol` (oldest → newest). */
export function loadFullCandles(symbol) {
  if (!fs.existsSync(MARKET_DATA_FILE)) return [];

  const raw = JSON.parse(fs.readFileSync(MARKET_DATA_FILE, "utf8"));

  if (Array.isArray(raw)) return [];

  const sym = String(symbol).trim().toUpperCase();
  if (!raw[sym]) return [];

  return Object.values(raw[sym]).sort((a, b) => a.timestamp - b.timestamp);
}

/** Close series only — plug-in replacement for `getIntraday()` closes. */
export function loadCandles(symbol) {
  return loadFullCandles(symbol).map((c) => c.close);
}
