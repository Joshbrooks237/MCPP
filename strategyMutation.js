/**
 * @param {Record<string, object>} metrics
 * @param {Record<string, number>} weights
 * @param {Record<string, { badInCurrentRegime?: boolean }>} regimeHistory
 */
export function mutateStrategies(metrics, weights, regimeHistory) {
  const mutated = { ...weights };

  for (const strat in metrics) {
    const m = metrics[strat];
    if (!m || !Object.prototype.hasOwnProperty.call(mutated, strat)) continue;

    const recentPenalty = (Number(m.recentLossStreak) || 0) * 0.15;
    const drawdownPenalty = Number(m.maxDrawdown) > 0.2 ? 0.3 : 0;
    const regimeMismatchPenalty =
      regimeHistory[strat]?.badInCurrentRegime ? 0.25 : 0;

    const survivalScore =
      Number(m.pnl) * 0.6 +
      Number(m.winRate) * 0.3 -
      (recentPenalty + drawdownPenalty + regimeMismatchPenalty);

    if (survivalScore < -0.5) {
      mutated[strat] *= 0.3;
    } else if (survivalScore < 0) {
      mutated[strat] *= 0.7;
    } else if (survivalScore > 0.5) {
      mutated[strat] *= 1.1;
    }
  }

  const sum = Object.values(mutated).reduce((a, b) => a + b, 0);

  for (const k in mutated) {
    mutated[k] /= sum || 1;
  }

  return mutated;
}
