export function defaultStrategyParams() {
  return {
    rsi_threshold_buy: 38,
    rsi_threshold_sell: 62,
    wave_weight: 0.5,
    current_weight: 0.5,
    volatility_sensitivity: 1,
  };
}

/** @typedef {{ id: string, name: string, type: "AI"|"TECHNICAL", slot: string, params: ReturnType<typeof defaultStrategyParams>, frozen?: boolean, suppressed?: boolean, parentId?: string }} StrategyTemplate */

function canonicalTemplates() {
  const p = defaultStrategyParams();
  return /** @type {StrategyTemplate[]} */ ([
    {
      id: "base_ai",
      name: "base_ai",
      type: "AI",
      slot: "base_ai",
      params: { ...p },
      frozen: true,
      suppressed: false,
    },
    {
      id: "claude_ai",
      name: "claude_ai",
      type: "AI",
      slot: "claude_ai",
      params: { ...p },
      frozen: true,
      suppressed: false,
    },
    {
      id: "council_ai",
      name: "council_ai",
      type: "AI",
      slot: "council_ai",
      params: { ...p },
      frozen: true,
      suppressed: false,
    },
    {
      id: "technical_only",
      name: "technical_only",
      type: "TECHNICAL",
      slot: "technical_only",
      params: { ...p },
      frozen: true,
      suppressed: false,
    },
  ]);
}

/** @type {StrategyTemplate[]} */
let population = [];

let cumulativeCycles = 0;

export const EVOLUTION_DEFAULTS = {
  everyNTrades: 15,
  maxPopulation: 16,
};

export function resetPopulation() {
  population = canonicalTemplates();
  cumulativeCycles = 0;
}

export function ensurePopulationSeed() {
  if (!population.length) population = canonicalTemplates();
}

export function getPopulation() {
  ensurePopulationSeed();
  return [...population];
}

export function getActiveExecutionIds() {
  ensurePopulationSeed();
  return population.map((e) => e.id);
}

export function getTemplateById(id) {
  ensurePopulationSeed();
  return population.find((e) => e.id === id) ?? null;
}

export function cloneStrategy(strategy) {
  const variation = JSON.parse(JSON.stringify(strategy));

  const mutate = (value, range = 0.1) =>
    value + (Math.random() * 2 - 1) * range;

  variation.id = `${strategy.slot}_clone_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  variation.name = `${strategy.name}_clone_${Date.now()}`;
  variation.parentId = strategy.id;
  variation.frozen = false;
  variation.suppressed = false;

  variation.params.rsi_threshold_buy = mutate(
    strategy.params.rsi_threshold_buy,
    2,
  );
  variation.params.rsi_threshold_sell = mutate(
    strategy.params.rsi_threshold_sell,
    2,
  );

  variation.params.wave_weight = Math.max(
    0,
    mutate(strategy.params.wave_weight, 0.1),
  );
  variation.params.current_weight = Math.max(
    0,
    mutate(strategy.params.current_weight, 0.1),
  );

  variation.params.volatility_sensitivity = Math.max(
    0,
    mutate(strategy.params.volatility_sensitivity, 0.1),
  );

  return variation;
}

function median(values) {
  if (!values.length) return 0.5;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function eligibleForClone(entry, metrics, medianWinRate) {
  const m = metrics[entry.id];
  if (!m || entry.frozen || entry.suppressed) return false;
  if ((m.totalTrades ?? 0) < 3) return false;
  return (
    m.pnl > 0 &&
    m.winRate > medianWinRate &&
    m.maxDrawdown < 0.25
  );
}

function trimPopulation(metrics, maxPop) {
  while (population.length > maxPop) {
    let victims = population
      .filter(
        (e) =>
          !e.frozen &&
          (metrics[e.id]?.totalTrades ?? 0) >= 1,
      )
      .map((e) => ({
        e,
        pnl: metrics[e.id]?.pnl ?? -Infinity,
      }))
      .sort((a, b) => a.pnl - b.pnl);
    if (!victims.length) {
      victims = population
        .filter((e) => !e.frozen)
        .map((e) => ({
          e,
          pnl: metrics[e.id]?.pnl ?? -Infinity,
        }))
        .sort((a, b) => a.pnl - b.pnl);
    }
    const drop = victims[0]?.e;
    if (!drop) break;
    population = population.filter((x) => x.id !== drop.id);
  }
}

function suppressWeakStrategies(metrics) {
  for (const e of population) {
    if (e.frozen) continue;
    const m = metrics[e.id];
    if (
      m &&
      m.totalTrades >= 5 &&
      m.pnl < -0.08 &&
      m.winRate < 0.35
    ) {
      e.suppressed = true;
    }
  }
}

/**
 * @param {() => Record<string, object>} getMetrics
 */
export function runEvolutionCycle(getMetrics, opts = {}) {
  ensurePopulationSeed();
  const {
    everyNTrades = EVOLUTION_DEFAULTS.everyNTrades,
    maxPopulation = EVOLUTION_DEFAULTS.maxPopulation,
  } = opts;

  cumulativeCycles += 1;
  if (cumulativeCycles % everyNTrades !== 0) return { evolved: false };

  const metrics = getMetrics();
  const rates = Object.values(metrics)
    .filter((m) => m && (m.totalTrades ?? 0) >= 1)
    .map((m) => m.winRate);
  const medianWr = median(rates.length ? rates : [0.5]);

  const candidates = population.filter((e) =>
    eligibleForClone(e, metrics, medianWr),
  );

  let added = 0;
  for (const c of candidates.slice(0, 2)) {
    if (population.length >= maxPopulation) break;
    population.push(cloneStrategy(c));
    added += 1;
  }

  trimPopulation(metrics, maxPopulation);
  suppressWeakStrategies(getMetrics());

  return { evolved: true, clonesAdded: added };
}
