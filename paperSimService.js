import { getSignal } from "./signalEngine.js";
import { runAiPipeline } from "./aiOrchestrator.js";
import { runCouncilAI } from "./strategyRunner.js";
import {
  applyPaperSimDecision,
  getPaperSimSnapshot,
} from "./paperPortfolio.js";

/** Two parallel universes — same AI stack; crypto is handy when equity sessions are closed. */
export const PAPER_SIM_MARKETS = {
  equities: [
    { id: "AAPL", feed: "AAPL" },
    { id: "TSLA", feed: "TSLA" },
  ],
  crypto: [
    { id: "BTC", feed: "BTC-USD" },
    { id: "ETH", feed: "ETH-USD" },
  ],
};

let activePaperSimMarket = "equities";

let tickCounter = 0;

export function resetPaperSimTickCounter() {
  tickCounter = 0;
}

export function setPaperSimMarket(mode) {
  if (mode !== "equities" && mode !== "crypto") {
    throw new Error('market must be "equities" or "crypto"');
  }
  activePaperSimMarket = mode;
}

export function getPaperSimMarket() {
  return activePaperSimMarket;
}

function activeAssets() {
  return PAPER_SIM_MARKETS[activePaperSimMarket];
}

function summarizeReason(aiPack, decision) {
  const parts = [];
  const r = aiPack?.openai?.reasoning;
  if (Array.isArray(r) && r.length) parts.push(String(r[0]));
  const issue = aiPack?.claude?.issues?.[0];
  if (issue) parts.push(`Risk: ${issue}`);
  if (!parts.length)
    parts.push(
      `Council ${decision.action} (${(decision.confidence ?? 0).toFixed(2)} confidence).`,
    );
  return parts.slice(0, 2).join(" ");
}

export async function runPaperSimTick(forceAi = true) {
  const assets = activeAssets();
  const idx = tickCounter % assets.length;
  tickCounter += 1;
  const { id: symbolId, feed } = assets[idx];

  const signals = await Promise.all(assets.map((a) => getSignal(a.feed)));
  const marks = Object.fromEntries(
    assets.map((a, i) => [a.id, signals[i].price]),
  );

  const signal = signals[idx];
  const aiPack = await runAiPipeline(signal, { forceAi });
  const decision = runCouncilAI(signal, aiPack, {});
  const regime = signal.regime ?? null;

  let act = String(decision.action ?? "HOLD").toUpperCase();
  if (act === "NO TRADE") act = "HOLD";

  applyPaperSimDecision(act, symbolId, marks, regime);

  const snap = getPaperSimSnapshot(marks);
  const assetOrder = assets.map((a) => a.id);
  return {
    market: activePaperSimMarket,
    assetOrder,
    symbolEvaluated: symbolId,
    feedEvaluated: feed,
    prices: marks,
    decision: { action: act, confidence: decision.confidence },
    reason: summarizeReason(aiPack, decision),
    portfolio: snap,
  };
}

export async function getPaperSimStateLive() {
  const assets = activeAssets();
  const signals = await Promise.all(assets.map((a) => getSignal(a.feed)));
  const marks = Object.fromEntries(
    assets.map((a, i) => [a.id, signals[i].price]),
  );
  const assetOrder = assets.map((a) => a.id);
  return {
    market: activePaperSimMarket,
    assetOrder,
    prices: marks,
    portfolio: getPaperSimSnapshot(marks),
  };
}
