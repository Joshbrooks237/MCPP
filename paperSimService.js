import { getSignal } from "./signalEngine.js";
import { runAiPipeline } from "./aiOrchestrator.js";
import { runCouncilAI } from "./strategyRunner.js";
import {
  initializePortfolio,
  applyPaperSimDecision,
  getPaperSimSnapshot,
} from "./paperPortfolio.js";

const SIM_SYMBOLS = ["AAPL", "TSLA"];

let tickCounter = 0;

export function resetPaperSimTickCounter() {
  tickCounter = 0;
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
  const symbol = SIM_SYMBOLS[tickCounter % 2];
  tickCounter += 1;

  const [sigAapl, sigTsla] = await Promise.all([
    getSignal("AAPL"),
    getSignal("TSLA"),
  ]);
  const marks = {
    AAPL: sigAapl.price,
    TSLA: sigTsla.price,
  };

  const signal = symbol === "AAPL" ? sigAapl : sigTsla;
  const aiPack = await runAiPipeline(signal, { forceAi });
  const decision = runCouncilAI(signal, aiPack, {});
  const regime = signal.regime ?? null;

  let act = String(decision.action ?? "HOLD").toUpperCase();
  if (act === "NO TRADE") act = "HOLD";

  applyPaperSimDecision(act, symbol, marks, regime);

  const snap = getPaperSimSnapshot(marks);
  return {
    symbolEvaluated: symbol,
    prices: marks,
    decision: { action: act, confidence: decision.confidence },
    reason: summarizeReason(aiPack, decision),
    portfolio: snap,
  };
}

export async function getPaperSimStateLive() {
  const [a, t] = await Promise.all([getSignal("AAPL"), getSignal("TSLA")]);
  const marks = { AAPL: a.price, TSLA: t.price };
  return {
    prices: marks,
    portfolio: getPaperSimSnapshot(marks),
  };
}
