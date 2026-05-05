import {
  PROMPT_CLAUDE_SKEPTIC,
  PROMPT_OPENAI_SYNTHESIZER,
  PROMPT_XAI_ANOMALY,
} from "./prompts.js";
import { computeCurrent } from "./marketCurrents.js";
import { computeRegime } from "./marketRegime.js";
import { localAnomalyCheck } from "./anomalyLocal.js";
import { shouldInvokeAi } from "./aiGate.js";

const CONFIDENCE_DEGRADE_STUB = 0.15;

function applyStubConfidenceDegradation(openai) {
  if (!openai || typeof openai.confidence !== "number") return openai;
  return {
    ...openai,
    confidence: Math.max(0, openai.confidence - CONFIDENCE_DEGRADE_STUB),
  };
}

function injectPromptPayload(template, payload) {
  return template.replace(
    "{{DATA}}",
    JSON.stringify(payload, null, 2),
  );
}

/** @param {object} marketState — wave + ocean currents (no anomaly). */
export function buildPrompts(marketState) {
  const payload = { market_state: marketState };
  return {
    openai: injectPromptPayload(PROMPT_OPENAI_SYNTHESIZER, payload),
    claude: injectPromptPayload(PROMPT_CLAUDE_SKEPTIC, payload),
    xai: injectPromptPayload(PROMPT_XAI_ANOMALY, payload),
  };
}

export function parseJsonFromModel(text) {
  const trimmed = String(text).trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fence ? fence[1].trim() : trimmed;
  return JSON.parse(raw);
}

async function openAiCompatibleChat({
  url,
  apiKey,
  model,
  prompt,
  useJsonMode,
}) {
  const body = {
    model,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.2,
  };
  if (useJsonMode) {
    body.response_format = { type: "json_object" };
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`${url} ${res.status}: ${errText}`);
  }

  const json = await res.json();
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI-compatible: empty content");
  return parseJsonFromModel(content);
}

async function anthropicMessages({ apiKey, model, prompt }) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic ${res.status}: ${errText}`);
  }

  const json = await res.json();
  const text = json.content?.find((b) => b.type === "text")?.text;
  if (!text) throw new Error("Anthropic: empty content");
  return parseJsonFromModel(text);
}

async function callOpenAI(prompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");
  return openAiCompatibleChat({
    url: "https://api.openai.com/v1/chat/completions",
    apiKey,
    model,
    prompt,
    useJsonMode: true,
  });
}

async function callClaude(prompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-20250514";
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
  return anthropicMessages({ apiKey, model, prompt });
}

async function callXAI(prompt) {
  const apiKey = process.env.XAI_API_KEY;
  const model = process.env.XAI_MODEL ?? "grok-3-latest";
  if (!apiKey) throw new Error("XAI_API_KEY not set");
  return openAiCompatibleChat({
    url: "https://api.x.ai/v1/chat/completions",
    apiKey,
    model,
    prompt,
    useJsonMode: false,
  });
}

export function decide(openai, claude, xai) {
  if (!openai || !claude || !xai) {
    throw new Error(
      "decide() requires openai, claude, and xai (including local anomaly fallback)",
    );
  }
  if (xai.avoid_trade) return "NO TRADE";

  if (claude.risk_level === "HIGH") return "NO TRADE";

  if (openai.action === "SELL" && openai.confidence > 0.65) {
    return "SELL";
  }

  if (openai.action === "BUY" && openai.confidence > 0.65) {
    return "BUY";
  }

  return "HOLD";
}

/** Parallel calls; failed providers return null and are recorded in `errors`. */
export async function runAI(marketState) {
  const prompts = buildPrompts(marketState);
  const errors = {};

  const [openai, claude, xai] = await Promise.all([
    callOpenAI(prompts.openai).catch((e) => {
      errors.openai = String(e.message ?? e);
      return null;
    }),
    callClaude(prompts.claude).catch((e) => {
      errors.claude = String(e.message ?? e);
      return null;
    }),
    callXAI(prompts.xai).catch((e) => {
      errors.xai = String(e.message ?? e);
      return null;
    }),
  ]);

  return { openai, claude, xai, errors };
}

/** Same outputs as legacy `runMultiAi` for the HTTP layer.
 * Evolution steps 5–8 (council portfolio, metrics, mutation) run in comparisonEngine.runComparisonStep.
 */
export async function runAiPipeline(signal, { forceAi = false } = {}) {
  const regime = computeRegime(signal);
  signal.regime = regime;

  signal.current = computeCurrent(signal.closes);
  if (signal.wave_state == null || signal.wave_state === undefined) {
    signal.wave_state = "neutral";
  }
  if (signal.wave_phase == null || !Number.isFinite(signal.wave_phase)) {
    signal.wave_phase = 0;
  }

  const telemetrySkipped = {
    xai_available: false,
    used_local_anomaly: false,
    anomaly_flags: [],
    anomaly_source: "none",
    wave_state: signal.wave_state,
    wave_phase: signal.wave_phase,
    current: signal.current,
    regime: signal.regime,
  };

  if (!forceAi && !shouldInvokeAi(signal)) {
    return {
      openai: null,
      claude: null,
      xai: null,
      xaiResult: null,
      errors: {},
      finalDecision: null,
      ok: false,
      aiSkipped: true,
      aiSkipReason: "rsi_bb_gate",
      xaiStubbed: false,
      ...telemetrySkipped,
    };
  }

  const marketState = {
    wave_state: signal.wave_state,
    wave_phase: signal.wave_phase,
    current_direction: signal.current?.direction,
    current_strength: signal.current?.strength,
    volatility: signal.current?.volatility,
  };

  const { openai, claude, xai, errors } = await runAI(marketState);

  let xaiStubbed = false;
  let xaiResult;
  if (xai === null) {
    xaiStubbed = true;
    xaiResult = localAnomalyCheck(signal);
  } else {
    xaiResult = xai;
  }

  const coreReady =
    openai &&
    claude &&
    typeof openai.action === "string" &&
    typeof openai.confidence === "number" &&
    typeof claude.risk_level === "string";

  let openaiOut = openai;
  if (xaiStubbed) {
    openaiOut = applyStubConfidenceDegradation(openai);
  }

  const ready =
    coreReady &&
    xaiResult &&
    typeof xaiResult.avoid_trade === "boolean";

  let finalDecision = null;
  if (ready) {
    try {
      finalDecision = decide(openaiOut, claude, xaiResult);
    } catch (e) {
      errors.decide = String(e.message ?? e);
    }
  }

  const used_local_anomaly = xaiStubbed;
  const anomaly_flags =
    xaiStubbed && Array.isArray(xaiResult?.notes)
      ? [...xaiResult.notes]
      : [];

  return {
    openai: openaiOut,
    claude,
    xai,
    xaiResult,
    xaiStubbed,
    xai_available: !xaiStubbed,
    anomaly_source: xaiStubbed ? "local" : "xai",
    wave_state: signal.wave_state,
    wave_phase: signal.wave_phase,
    current: signal.current,
    finalDecision,
    errors,
    ok: ready && finalDecision != null,
    used_local_anomaly,
    anomaly_flags,
    regime: signal.regime,
  };
}
