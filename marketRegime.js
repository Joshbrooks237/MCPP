export function computeRegime(signal) {
  const closes = signal.closes;
  if (!closes || closes.length < 100) return "UNKNOWN";

  const recent = closes.slice(-50);
  const older = closes.slice(-100, -50);

  const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;

  const trend = avg(recent) - avg(older);

  const volatility =
    recent.reduce((s, v, i, a) => {
      if (i === 0) return 0;
      return s + Math.abs(v - a[i - 1]);
    }, 0) / recent.length;

  if (volatility > 2.0 && Math.abs(trend) < 0.5) return "CHOP";
  if (trend > 1 && volatility < 1.5) return "TREND_UP";
  if (trend < -1 && volatility < 1.5) return "TREND_DOWN";
  if (volatility > 3) return "EXPANSION";
  return "NEUTRAL";
}
