import fs from "fs";
import { yahoo } from "./yahooClient.js";
import { withRetry } from "./yahooRetry.js";
import { readTrades, writeTrades, TRADES_FILE } from "./logger.js";

export async function processDueCheckpoints() {
  if (!fs.existsSync(TRADES_FILE)) {
    return { processed: false, count: 0 };
  }

  const data = readTrades();

  const now = Date.now();
  let changed = false;

  for (const trade of data) {
    if (!trade.checkpoints) continue;

    for (const cp of trade.checkpoints) {
      if (cp.filled || now < cp.dueAt) continue;

      try {
        const quote = await withRetry(() => yahoo.quote(trade.symbol));

        const currentPrice =
          quote.regularMarketPrice ??
          quote.postMarketPrice ??
          quote.preMarketPrice;

        if (currentPrice == null || !Number.isFinite(currentPrice)) {
          throw new Error("No usable price on quote");
        }

        cp.price = currentPrice;
        cp.pct_change_from_entry =
          ((currentPrice - trade.price) / trade.price) * 100;

        cp.filled = true;
      } catch (err) {
        cp.error = err.message;
        cp.filled = true;
      }
      changed = true;
    }
  }

  if (changed) writeTrades(data);

  return { processed: changed, count: data.length };
}
