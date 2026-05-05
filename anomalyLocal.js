/**
 * Deterministic local anomaly layer when xAI is unavailable.
 * No external dependencies.
 */

export function localAnomalyCheck(signal) {
  const s = signal && typeof signal === "object" ? signal : {};
  const { velocity, acceleration, rsi, bollinger_position } = s;

  let flags = [];

  if (rsi > 80 || rsi < 20) {
    flags.push("extreme_rsi");
  }

  if (velocity > 0 && acceleration < -0.1) {
    flags.push("sharp_deceleration");
  }

  if (velocity < 0 && acceleration > 0.1) {
    flags.push("sharp_reversal_up");
  }

  if (bollinger_position > 0.95 || bollinger_position < 0.05) {
    flags.push("band_extreme");
  }

  const avoid_trade = flags.length >= 2;

  return {
    behavior: flags.length ? "ANOMALOUS" : "NORMAL",
    avoid_trade,
    notes: flags,
  };
}
