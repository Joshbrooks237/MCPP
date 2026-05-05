import { loadCandles } from "./loadMarketData.js";
import { getIntraday } from "./dataService.js";
import { RSI, BollingerBands } from "technicalindicators";

const MIN_CLOSES = 50;

// --- HELPERS ---
function derivative(data) {
  const result = [];
  for (let i = 1; i < data.length; i++) {
    result.push(data[i] - data[i - 1]);
  }
  return result;
}

function normalize(value, arr) {
  const min = Math.min(...arr);
  const max = Math.max(...arr);
  if (max === min) return 0;
  return (value - min) / (max - min);
}

// --- SIMPLE STRATEGY (v1 baseline) ---
function strategy({ velocity, acceleration, rsi, bbPos }) {
  // SELL near peak
  if (velocity > 0 && acceleration < 0 && rsi > 65 && bbPos > 0.85) {
    return "SELL";
  }

  // BUY near trough
  if (velocity < 0 && acceleration > 0 && rsi < 35 && bbPos < 0.15) {
    return "BUY";
  }

  return "HOLD";
}

// --- BACKTEST ---
export async function runBacktest(symbol) {
  let closes = loadCandles(symbol);

  if (closes.length < MIN_CLOSES) {
    closes = await getIntraday(symbol);
  }

  const rsiArr = RSI.calculate({ values: closes, period: 14 });
  const bbArr = BollingerBands.calculate({
    values: closes,
    period: 20,
    stdDev: 2,
  });

  const velocityArr = derivative(closes);
  const accelerationArr = derivative(velocityArr);

  const trades = [];
  let position = null;

  for (let i = 30; i < closes.length - 10; i++) {
    const price = closes[i];

    const velocity = velocityArr[i - 1];
    const acceleration = accelerationArr[i - 2];

    const rsi = rsiArr[i - 14];
    const bb = bbArr[i - 20];

    if (rsi == null || bb == null) continue;

    const spread = bb.upper - bb.lower;
    const bbPos = spread === 0 ? 0.5 : (price - bb.lower) / spread;

    const action = strategy({ velocity, acceleration, rsi, bbPos });

    // --- ENTER TRADE ---
    if (!position && action === "BUY") {
      position = {
        entryPrice: price,
        entryIndex: i,
      };
    }

    // --- EXIT TRADE ---
    if (position && action === "SELL") {
      const exitPrice = price;

      const pct =
        ((exitPrice - position.entryPrice) / position.entryPrice) * 100;

      trades.push(pct);

      position = null;
    }
  }

  const total = trades.reduce((a, b) => a + b, 0);
  const n = trades.length;
  const winRate = n ? trades.filter((t) => t > 0).length / n : 0;

  return {
    symbol,
    trades: n,
    totalReturn: total.toFixed(2) + "%",
    avgReturn: n ? (total / n).toFixed(2) + "%" : "0%",
    winRate: (winRate * 100).toFixed(2) + "%",
  };
}
