export function computeCurrent(closes) {
  if (!closes || closes.length < 100) return null;

  const recent = closes.slice(-50);
  const older = closes.slice(-100, -50);

  const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;

  const recentAvg = avg(recent);
  const olderAvg = avg(older.length ? older : recent);

  const slope = recentAvg - olderAvg;

  const volatility =
    recent.reduce((sum, v, i, arr) => {
      if (i === 0) return 0;
      return sum + Math.abs(v - arr[i - 1]);
    }, 0) / recent.length;

  return {
    direction: slope > 0 ? "UP" : "DOWN",
    strength: Math.abs(slope),
    volatility,
  };
}
