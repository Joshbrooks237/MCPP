import { runAiPipeline } from "./aiOrchestrator.js";
import {
  defaultStrategyParams,
  ensurePopulationSeed,
  getPopulation,
  getTemplateById,
} from "./strategyEvolution.js";
import {
  getCouncilDecisionWeights,
} from "./regimeStrategyAllocator.js";

function normalizeAction(action) {
  const a = String(action ?? "").toUpperCase();
  if (a === "NO TRADE" || a === "NONE") return "HOLD";
  if (a === "BUY" || a === "SELL") return a;
  return "HOLD";
}

export { defaultStrategyParams };

export function runBaseAI(signal, aiPack) {
  const o = aiPack?.openai;
  return {
    action: normalizeAction(o?.action),
    confidence: typeof o?.confidence === "number" ? o.confidence : 0,
    price: signal.price,
  };
}

export function runClaudeAI(signal, aiPack) {
  const risk = String(aiPack?.claude?.risk_level ?? "").toUpperCase();
  const openAct = normalizeAction(aiPack?.openai?.action);
  let action = "HOLD";
  if (risk === "LOW") action = openAct === "HOLD" ? "HOLD" : openAct;
  else if (risk === "MEDIUM") action = "HOLD";
  else if (risk === "HIGH") action = "HOLD";
  return {
    action,
    confidence:
      risk === "LOW"
        ? typeof aiPack?.openai?.confidence === "number"
          ? aiPack.openai.confidence
          : 0.45
        : 0.35,
    price: signal.price,
  };
}

export function voteOpenAi(aiPack) {
  return normalizeAction(aiPack?.openai?.action);
}

export function voteClaude(aiPack) {
  const risk = String(aiPack?.claude?.risk_level ?? "").toUpperCase();
  if (risk === "HIGH") return "HOLD";
  return normalizeAction(aiPack?.openai?.action);
}

export function voteXai(aiPack) {
  const x = aiPack?.xaiResult;
  if (!x || x.avoid_trade === true) return "HOLD";
  return normalizeAction(aiPack?.openai?.action);
}

const VOTER_KEYS = ["base_ai", "claude_ai", "technical_only"];

function normalizeVoterWeights(weights) {
  const sub = {};
  let s = 0;
  for (const k of VOTER_KEYS) {
    sub[k] = Number(weights?.[k]) || 0;
    s += sub[k];
  }
  if (s <= 0) {
    const u = 1 / VOTER_KEYS.length;
    for (const k of VOTER_KEYS) sub[k] = u;
    return sub;
  }
  for (const k of VOTER_KEYS) sub[k] /= s;
  return sub;
}

function blendAiOutput(signal, base, params) {
  const ww = Number(params.wave_weight) || 0;
  const cw = Number(params.current_weight) || 0;
  const vols = Number(params.volatility_sensitivity) || 1;
  const waveAlign = Number(signal.wave_phase ?? 0.5);
  const dir =
    signal.current?.direction === "UP"
      ? 1
      : signal.current?.direction === "DOWN"
        ? -1
        : 0;
  const vol = Number(signal.current?.volatility ?? 0);
  const denom = Math.max(1e-6, ww + cw);
  const envBoost =
    ((ww * waveAlign + cw * ((dir + 1) * 0.5)) / denom) *
    (1 / (1 + vol * vols * 0.01));
  const conf = Math.min(
    1,
    Math.max(
      0.05,
      (base.confidence ?? 0.5) * (0.65 + 0.55 * Math.min(1, envBoost)),
    ),
  );
  return { ...base, confidence: conf };
}

export function runTechnicalWithParams(signal, params = defaultStrategyParams()) {
  const rsi = Number(signal.rsi);
  const v = Number(signal.velocity);
  const buyTh = Number(params.rsi_threshold_buy ?? 38);
  const sellTh = Number(params.rsi_threshold_sell ?? 62);
  let action = "HOLD";
  const bandLow = buyTh - 6;
  const bandHigh = sellTh + 6;
  if (Number.isFinite(rsi)) {
    if (rsi < bandLow && v >= 0) action = "BUY";
    else if (rsi > bandHigh && v <= 0) action = "SELL";
    else if (rsi < buyTh) action = "BUY";
    else if (rsi > sellTh) action = "SELL";
  }
  const vs = Number(params.volatility_sensitivity) || 1;
  const vol = Number(signal.current?.volatility ?? 0);
  const conf = Math.min(1, 0.55 / (1 + vol * vs * 0.02));
  return { action, confidence: conf, price: signal.price };
}

export function runStrategyEntry(signal, aiPack, entry) {
  ensurePopulationSeed();
  if (!entry || entry.suppressed) {
    return { action: "HOLD", confidence: 0, price: signal.price };
  }
  const params = entry.params ?? defaultStrategyParams();

  switch (entry.slot) {
    case "base_ai":
      return blendAiOutput(signal, runBaseAI(signal, aiPack), params);
    case "claude_ai":
      return blendAiOutput(signal, runClaudeAI(signal, aiPack), params);
    case "technical_only":
      return runTechnicalWithParams(signal, params);
    default:
      return { action: "HOLD", confidence: 0, price: signal.price };
  }
}

function weightedVote(signal, aiPack, strategyOutputs, rawWeights) {
  const w = normalizeVoterWeights(rawWeights);

  let buy = 0;
  let sell = 0;
  let hold = 0;

  for (const k of VOTER_KEYS) {
    const d = strategyOutputs[k];
    if (!d) continue;
    const wt = w[k];
    const c = Math.max(0.05, Math.min(1, Number(d.confidence) || 0.5));
    if (d.action === "BUY") buy += wt * c;
    else if (d.action === "SELL") sell += wt * c;
    else hold += wt * c;
  }

  if (aiPack?.xaiResult?.avoid_trade === true) {
    buy *= 0.45;
    sell *= 0.45;
    hold += 0.15;
  }

  let action = "HOLD";
  const eps = 1e-6;
  if (buy >= sell && buy >= hold && buy > eps) action = "BUY";
  else if (sell > buy && sell >= hold && sell > eps) action = "SELL";

  const mass = buy + sell + hold || 1;
  const rawConf =
    action === "BUY" ? buy / mass : action === "SELL" ? sell / mass : hold / mass;
  const councilBoost = Number(rawWeights?.council_ai) || 1;
  const confidence = Math.min(1, rawConf * (0.85 + 0.15 * councilBoost));

  return { action, confidence, price: signal.price };
}

export function runCouncilAI(signal, aiPack, options = {}) {
  ensurePopulationSeed();

  const peer =
    options.peerDecisions ??
    ({
      base_ai: runStrategyEntry(
        signal,
        aiPack,
        getTemplateById("base_ai") ?? {
          id: "base_ai",
          name: "base_ai",
          type: "AI",
          slot: "base_ai",
          params: defaultStrategyParams(),
        },
      ),
      claude_ai: runStrategyEntry(
        signal,
        aiPack,
        getTemplateById("claude_ai") ?? {
          id: "claude_ai",
          name: "claude_ai",
          type: "AI",
          slot: "claude_ai",
          params: defaultStrategyParams(),
        },
      ),
      technical_only: runStrategyEntry(
        signal,
        aiPack,
        getTemplateById("technical_only") ?? {
          id: "technical_only",
          name: "technical_only",
          type: "TECHNICAL",
          slot: "technical_only",
          params: defaultStrategyParams(),
        },
      ),
    });

  const regimeLabel =
    signal.regime === "UNKNOWN" || signal.regime == null
      ? "NEUTRAL"
      : signal.regime;

  const weights =
    options.weights ?? getCouncilDecisionWeights(regimeLabel);

  return weightedVote(signal, aiPack, peer, weights);
}

export function runTechnicalStrategy(signal) {
  ensurePopulationSeed();
  const entry = getTemplateById("technical_only");
  return runTechnicalWithParams(
    signal,
    entry?.params ?? defaultStrategyParams(),
  );
}

export async function runCouncilStrategy(signal, pipelineOpts = {}) {
  ensurePopulationSeed();
  const aiPack = await runAiPipeline(signal, pipelineOpts);
  const regimeLabel =
    signal.regime === "UNKNOWN" || signal.regime == null
      ? "NEUTRAL"
      : signal.regime;
  const weights = getCouncilDecisionWeights(regimeLabel);
  return runCouncilAI(signal, aiPack, { weights });
}

export async function runStrategies(signal, pipelineOpts = {}) {
  ensurePopulationSeed();
  const aiPack = await runAiPipeline(signal, pipelineOpts);

  const entries = getPopulation().filter((e) => e.slot !== "council_ai");

  /** @type {Record<string, ReturnType<runStrategyEntry>>} */
  const decisions = {};

  for (const entry of entries) {
    decisions[entry.id] = runStrategyEntry(signal, aiPack, entry);
  }

  const regimeLabel =
    signal.regime === "UNKNOWN" || signal.regime == null
      ? "NEUTRAL"
      : signal.regime;
  const weights = getCouncilDecisionWeights(regimeLabel);

  decisions.council_ai = runCouncilAI(signal, aiPack, {
    weights,
    peerDecisions: {
      base_ai: decisions.base_ai,
      claude_ai: decisions.claude_ai,
      technical_only: decisions.technical_only,
    },
  });

  return decisions;
}
