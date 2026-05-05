import { mutateStrategies } from "./strategyMutation.js";

const regimeModifiers = {
  TREND_UP: {
    base_ai: 1.2,
    claude_ai: 1.0,
    council_ai: 1.3,
    technical_only: 1.1,
  },
  TREND_DOWN: {
    base_ai: 1.1,
    claude_ai: 1.2,
    council_ai: 1.3,
    technical_only: 1.0,
  },
  CHOP: {
    base_ai: 0.9,
    claude_ai: 1.1,
    council_ai: 1.4,
    technical_only: 1.3,
  },
  EXPANSION: {
    base_ai: 1.0,
    claude_ai: 1.3,
    council_ai: 1.5,
    technical_only: 0.8,
  },
  NEUTRAL: {
    base_ai: 1.0,
    claude_ai: 1.0,
    council_ai: 1.0,
    technical_only: 1.0,
  },
};

export const REGIME_LABELS = [
  "TREND_UP",
  "TREND_DOWN",
  "CHOP",
  "EXPANSION",
  "NEUTRAL",
];

export const STRATEGY_METRIC_KEYS = [
  "base_ai",
  "claude_ai",
  "council_ai",
  "technical_only",
];

function emptyRegimeSlice() {
  return {
    pnl: 0,
    winRate: 0,
    maxDrawdown: 0,
    recentLossStreak: 0,
    totalTrades: 0,
  };
}

function emptyRegimePerformance() {
  const o = {};
  for (const r of REGIME_LABELS) o[r] = emptyRegimeSlice();
  return o;
}

/** Full persistent metrics per strategy (global + per-regime). */
function emptyStrategyMetricBlock() {
  return {
    pnl: 0,
    winRate: 0,
    maxDrawdown: 0,
    recentLossStreak: 0,
    totalTrades: 0,
    regimePerformance: emptyRegimePerformance(),
  };
}

function defaultMetrics() {
  const out = {};
  for (const k of STRATEGY_METRIC_KEYS) out[k] = emptyStrategyMetricBlock();
  return out;
}

let rollingPerformanceMetrics = defaultMetrics();

/** Post–trade-cycle mutated weights for next same-regime council vote. */
let cachedMutatedWeights = null;
let cachedMutatedForRegime = null;

export function getStrategyMetrics() {
  return JSON.parse(JSON.stringify(rollingPerformanceMetrics));
}

/** @deprecated alias */
export function getPerformanceMetrics() {
  return getStrategyMetrics();
}

export function resetPerformanceMetrics() {
  rollingPerformanceMetrics = defaultMetrics();
  cachedMutatedWeights = null;
  cachedMutatedForRegime = null;
}

export function ensureMetricSlots(ids) {
  if (!ids || !Array.isArray(ids)) return;
  for (const id of ids) {
    if (!rollingPerformanceMetrics[id])
      rollingPerformanceMetrics[id] = emptyStrategyMetricBlock();
  }
}

function normRegime(reg) {
  return REGIME_LABELS.includes(reg) ? reg : "NEUTRAL";
}

export function buildRegimeHistory(metrics, currentRegime) {
  const cr = normRegime(currentRegime === "UNKNOWN" ? "NEUTRAL" : currentRegime);
  const out = {};
  for (const strat of STRATEGY_METRIC_KEYS) {
    const rp = metrics[strat]?.regimePerformance?.[cr];
    const bad =
      rp &&
      rp.totalTrades >= 2 &&
      (rp.winRate < 0.35 || rp.pnl < -0.02);
    out[strat] = { badInCurrentRegime: !!bad };
  }
  return out;
}

export function getCouncilDecisionWeights(regime) {
  const r = normRegime(regime === "UNKNOWN" ? "NEUTRAL" : regime);
  if (
    cachedMutatedWeights &&
    cachedMutatedForRegime === r
  ) {
    return { ...cachedMutatedWeights };
  }
  const metrics = getStrategyMetrics();
  const base = computeRegimeWeights(r, metrics);
  const hist = buildRegimeHistory(metrics, r);
  return mutateStrategies(metrics, base, hist);
}

export function finalizeEvolutionCycle(signalRegime) {
  const r = normRegime(signalRegime === "UNKNOWN" ? "NEUTRAL" : signalRegime);
  const metrics = getStrategyMetrics();
  const base = computeRegimeWeights(r, metrics);
  const hist = buildRegimeHistory(metrics, r);
  cachedMutatedWeights = mutateStrategies(metrics, base, hist);
  cachedMutatedForRegime = r;
}

function maxDrawdownFromPnls(pnls) {
  let cum = 0;
  let peak = 0;
  let maxDd = 0;
  for (const p of pnls) {
    cum += p;
    peak = Math.max(peak, cum);
    maxDd = Math.max(maxDd, peak - cum);
  }
  const scale = Math.max(Math.abs(peak), 1e-6);
  return Math.min(2, maxDd / scale);
}

function recentLossStreakFromPnls(pnls) {
  let streak = 0;
  for (let i = pnls.length - 1; i >= 0; i--) {
    if (pnls[i] <= 0) streak += 1;
    else break;
  }
  return streak;
}

function bucketFromPnls(pnls, initialBalance) {
  const totalPnl = pnls.reduce((a, b) => a + b, 0);
  const wins = pnls.filter((p) => p > 0).length;
  const winRate = pnls.length ? wins / pnls.length : 0;
  return {
    pnl: totalPnl / initialBalance,
    winRate,
    maxDrawdown: maxDrawdownFromPnls(pnls),
    recentLossStreak: recentLossStreakFromPnls(pnls),
    totalTrades: pnls.length,
  };
}

/**
 * @param {Record<string, ReturnType<import("./paperPortfolio.js").createPaperPortfolio>>} portfoliosMap
 */
export function syncPerformanceFromComparisonPortfolios(
  portfoliosMap,
  keys,
  initialBalance = 10000,
) {
  for (const strat of keys) {
    const api = portfoliosMap[strat];
    if (!api) continue;

    const trades = api.snapshot().trades;
    const sellsAll = trades.filter((t) => t.action === "SELL");
    const pnlsAll = sellsAll.map((t) => t.pnl);

    const globalBlock = bucketFromPnls(pnlsAll, initialBalance);
    const regimePerformance = emptyRegimePerformance();

    for (const label of REGIME_LABELS) {
      const sellsLabel = sellsAll.filter(
        (t) => normRegime(t.regime ?? "NEUTRAL") === label,
      );
      const pnlsLabel = sellsLabel.map((t) => t.pnl);
      const b = bucketFromPnls(pnlsLabel, initialBalance);
      regimePerformance[label] = b;
    }

    rollingPerformanceMetrics[strat] = {
      pnl: globalBlock.pnl,
      winRate: globalBlock.winRate,
      maxDrawdown: globalBlock.maxDrawdown,
      recentLossStreak: globalBlock.recentLossStreak,
      totalTrades: globalBlock.totalTrades,
      regimePerformance,
    };
  }
}

export function computeRegimeWeights(regime, performanceMetrics) {
  const base = regimeModifiers[regime] ?? regimeModifiers.NEUTRAL;
  const perfMap = performanceMetrics ?? rollingPerformanceMetrics;

  const weights = {};

  for (const strat in base) {
    const perf = perfMap[strat] ?? emptyStrategyMetricBlock();

    const performanceScore =
      Number(perf.pnl) * 0.6 +
      Number(perf.winRate) * 0.3 -
      Number(perf.maxDrawdown) * 0.1;

    weights[strat] = base[strat] * Math.max(0.1, performanceScore);
  }

  const sum = Object.values(weights).reduce((a, b) => a + b, 0);

  for (const k in weights) {
    weights[k] /= sum || 1;
  }

  return weights;
}
