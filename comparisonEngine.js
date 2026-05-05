import { createPaperPortfolio } from "./paperPortfolio.js";
import { runStrategies } from "./strategyRunner.js";
import {
  syncPerformanceFromComparisonPortfolios,
  resetPerformanceMetrics,
  finalizeEvolutionCycle,
  ensureMetricSlots,
  getStrategyMetrics,
} from "./regimeStrategyAllocator.js";
import {
  resetPopulation,
  runEvolutionCycle,
  ensurePopulationSeed,
  getActiveExecutionIds,
  EVOLUTION_DEFAULTS,
} from "./strategyEvolution.js";

/** @type {Record<string, ReturnType<createPaperPortfolio>>} */
const portfolios = {};

function ensurePortfolios(initialBalance = 10000) {
  ensurePopulationSeed();
  const keys = new Set(getActiveExecutionIds());
  for (const k of Object.keys(portfolios)) {
    if (!keys.has(k)) delete portfolios[k];
  }
  ensureMetricSlots([...keys]);
  for (const k of keys) {
    if (!portfolios[k]) portfolios[k] = createPaperPortfolio(initialBalance);
  }
}

export function resetAllPortfolios(initialBalance = 10000) {
  resetPopulation();
  resetPerformanceMetrics();
  for (const k of Object.keys(portfolios)) delete portfolios[k];
}

/**
 * One comparison step: all strategies on the same signal, independent books.
 * @returns {Promise<{ timestamp: string, price: number, strategies: object }>}
 */
export async function runComparisonStep(signal, options = {}) {
  const {
    initialBalance = 10000,
    forceAi = false,
    everyNTrades = EVOLUTION_DEFAULTS.everyNTrades,
    maxPopulation = EVOLUTION_DEFAULTS.maxPopulation,
  } = options;
  ensurePortfolios(initialBalance);

  const decisions = await runStrategies(signal, { forceAi });
  const timestamp = signal.timestamp ?? new Date().toISOString();
  const price = signal.price;

  const strategies = {};

  const regimeTag =
    signal.regime === "UNKNOWN" || signal.regime == null
      ? "NEUTRAL"
      : signal.regime;

  const keys = getActiveExecutionIds();

  for (const key of keys) {
    const decision = decisions[key];
    if (!decision) continue;
    const { pnl } = portfolios[key].applyDecision(decision, {
      timestamp,
      strategy: key,
      regime: regimeTag,
    });
    strategies[key] = {
      pnl,
      action: decision.action,
    };
  }

  syncPerformanceFromComparisonPortfolios(portfolios, keys, initialBalance);

  finalizeEvolutionCycle(signal.regime ?? regimeTag);

  runEvolutionCycle(() => getStrategyMetrics(), {
    everyNTrades,
    maxPopulation,
  });

  ensureMetricSlots(getActiveExecutionIds());

  return { timestamp, price, strategies };
}

function closedSellPnls(portfolioApi) {
  const snap = portfolioApi.snapshot();
  return snap.trades.filter((t) => t.action === "SELL").map((t) => t.pnl);
}

export function getCouncilDashboardData() {
  ensurePortfolios();
  const council = portfolios.council_ai;
  const snap = council
    ? council.snapshot()
    : {
        trades: [],
        balance: 0,
        equityCurve: [],
        position: null,
      };

  const ids = getActiveExecutionIds();
  const strategyLeaderboard = ids.map((name) => {
    const api = portfolios[name];
    const pnls = api ? closedSellPnls(api) : [];
    const totalPnl = pnls.reduce((s, p) => s + p, 0);
    const wins = pnls.filter((p) => p > 0).length;
    const winRate = pnls.length ? wins / pnls.length : 0;
    return { name, pnl: totalPnl, winRate };
  }).sort((a, b) => b.pnl - a.pnl);

  const recentTrades = [...snap.trades].slice(-25).reverse();

  return {
    balance: snap.balance,
    equityCurve: snap.equityCurve,
    openPosition: snap.position,
    recentTrades,
    strategyLeaderboard,
  };
}
