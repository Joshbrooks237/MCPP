import { RSI, BollingerBands } from "technicalindicators";
import { getIntraday } from "./dataService.js";

// --- CONFIG ---
export const SYMBOLS = ["TSLA", "AAPL"];

// --- HELPERS ---
export function derivative(data) {
  const result = [];
  for (let i = 1; i < data.length; i++) {
    result.push(data[i] - data[i - 1]);
  }
  return result;
}

export function normalize(value, arr) {
  const min = Math.min(...arr);
  const max = Math.max(...arr);
  if (max === min || !Number.isFinite(value)) return 0;
  return (value - min) / (max - min);
}

// --- CORE ---
export async function getSignal(symbol) {
  const closes = await getIntraday(symbol);

  if (closes.length < 50) {
    throw new Error(`Not enough data for ${symbol}`);
  }

  const rsiArr = RSI.calculate({ values: closes, period: 14 });
  const bbArr = BollingerBands.calculate({
    values: closes,
    period: 20,
    stdDev: 2,
  });

  const velocityArr = derivative(closes);
  const accelerationArr = derivative(velocityArr);

  const latestPrice = closes.at(-1);
  const latestVelocity = velocityArr.at(-1);
  const latestAcceleration = accelerationArr.at(-1);
  const latestRSI = rsiArr.at(-1);
  const latestBB = bbArr.at(-1);

  if (
    latestBB == null ||
    latestRSI == null ||
    latestVelocity == null ||
    latestAcceleration == null
  ) {
    throw new Error(`${symbol}: indicators not ready (partial windows).`);
  }

  const velNorm = normalize(latestVelocity, velocityArr);
  const accNorm = normalize(latestAcceleration, accelerationArr);

  const spread = latestBB.upper - latestBB.lower;
  const bbPosition =
    spread === 0 ? 0.5 : (latestPrice - latestBB.lower) / spread;

  const wave_phase = Math.min(
    1,
    Math.max(0, (latestRSI / 100 + bbPosition) / 2),
  );
  let wave_state = "neutral";
  if (latestVelocity > 0 && bbPosition > 0.65) wave_state = "peak_forming";
  else if (latestVelocity < 0 && bbPosition < 0.35)
    wave_state = "trough_forming";
  else if (latestVelocity > 0) wave_state = "uptrend";
  else if (latestVelocity < 0) wave_state = "downtrend";

  return {
    symbol,
    closes,
    wave_phase,
    wave_state,
    price: latestPrice,
    velocity: latestVelocity,
    velocity_norm: velNorm,
    acceleration: latestAcceleration,
    acceleration_norm: accNorm,
    rsi: latestRSI,
    bollinger_position: bbPosition,
    timestamp: new Date().toISOString(),
  };
}

export async function runEngine() {
  const results = [];

  for (const symbol of SYMBOLS) {
    const signal = await getSignal(symbol);
    results.push(signal);
    await new Promise((r) => setTimeout(r, 750));
  }

  return results;
}
