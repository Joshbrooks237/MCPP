import crypto from "node:crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const TRADES_FILE = path.join(__dirname, "trades.json");

export function readTrades() {
  if (!fs.existsSync(TRADES_FILE)) return [];
  return JSON.parse(fs.readFileSync(TRADES_FILE, "utf8"));
}

export function writeTrades(data) {
  fs.writeFileSync(TRADES_FILE, JSON.stringify(data, null, 2));
}

/**
 * Persists a signal-shaped row (plus optional metadata) and schedules checkpoints.
 * @param {object} signal — physics fields (symbol, price, …)
 * @param {object} [meta] — e.g. { ai, finalDecision }
 * @returns {object} the stored entry (includes id + checkpoints)
 */
export function logSignal(signal, meta = {}) {
  const data = readTrades();

  const now = Date.now();

  const entry = {
    id: crypto.randomUUID(),
    ...signal,
    ...meta,
    checkpoints: [
      { horizon: "15m", dueAt: now + 15 * 60 * 1000 },
      { horizon: "1h", dueAt: now + 60 * 60 * 1000 },
      { horizon: "1d", dueAt: now + 24 * 60 * 60 * 1000 },
    ],
  };

  data.push(entry);
  writeTrades(data);
  return entry;
}
