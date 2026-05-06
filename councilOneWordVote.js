/**
 * Five-model one-word council vote (BUY / HOLD / SELL).
 */

export const COUNCIL_SYSTEM_PROMPT =
  "You are a signal analyst studying asset momentum like ocean wave physics — velocity, acceleration, resistance. Given this data, respond with exactly one word: BUY, HOLD, or SELL.";

/** @param {string} text */
export function parseCouncilVote(text) {
  const raw = String(text ?? "").trim().toUpperCase();
  const fence = raw.match(/\b(BUY|SELL|HOLD)\b/);
  if (fence) return fence[1];
  const first = raw.split(/[\s,.;:]+/).filter(Boolean)[0];
  if (first === "BUY" || first === "SELL" || first === "HOLD") return first;
  return "HOLD";
}

async function openAiCompatibleOneWord({
  url,
  apiKey,
  model,
  userPayload,
}) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 8,
      messages: [
        { role: "system", content: COUNCIL_SYSTEM_PROMPT },
        {
          role: "user",
          content:
            "Market telemetry (JSON). Reply one word only.\n\n" +
            JSON.stringify(userPayload),
        },
      ],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`${url} ${res.status}: ${t}`);
  }
  const json = await res.json();
  const content = json.choices?.[0]?.message?.content;
  return parseCouncilVote(content);
}

export async function voteOpenAI(userPayload) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");
  let base = process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1";
  base = base.replace(/\/$/, "");
  const url = base.endsWith("/v1")
    ? `${base}/chat/completions`
    : `${base}/v1/chat/completions`;
  return openAiCompatibleOneWord({
    url,
    apiKey,
    model,
    userPayload,
  });
}

export async function voteClaude(userPayload) {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  const model =
    process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-20250514";
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 16,
      temperature: 0,
      system: COUNCIL_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content:
            "Market telemetry (JSON). Reply one word only.\n\n" +
            JSON.stringify(userPayload),
        },
      ],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Anthropic ${res.status}: ${t}`);
  }
  const json = await res.json();
  const text = json.content?.find((b) => b.type === "text")?.text;
  return parseCouncilVote(text);
}

export async function voteGrok(userPayload) {
  const apiKey = process.env.XAI_API_KEY?.trim();
  const model = process.env.XAI_MODEL ?? "grok-3-latest";
  if (!apiKey) throw new Error("XAI_API_KEY not set");
  return openAiCompatibleOneWord({
    url: "https://api.x.ai/v1/chat/completions",
    apiKey,
    model,
    userPayload,
  });
}

export async function voteOllama(userPayload) {
  const host = (process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434").replace(
    /\/$/,
    "",
  );
  const model = process.env.OLLAMA_MODEL?.trim() || "llama3.2:latest";
  const res = await fetch(`${host}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      options: { temperature: 0 },
      messages: [
        { role: "system", content: COUNCIL_SYSTEM_PROMPT },
        {
          role: "user",
          content:
            "Market telemetry (JSON). Reply one word only.\n\n" +
            JSON.stringify(userPayload),
        },
      ],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    const hint404 =
      res.status === 404
        ? " Run `ollama pull llama3.2` (or pull another tag) and set OLLAMA_MODEL to an exact name from `ollama list`."
        : "";
    throw new Error(`Ollama ${res.status}: ${t}${hint404}`);
  }
  const json = await res.json();
  const text = json.message?.content;
  return parseCouncilVote(text);
}

/** Deo: OpenAI-compatible chat (custom base URL). */
export async function voteDeo(userPayload) {
  const apiKey = process.env.DEO_API_KEY?.trim();
  const base = process.env.DEO_API_BASE?.trim();
  const model = process.env.DEO_MODEL?.trim() || "gpt-4o-mini";
  if (!apiKey || !base) {
    throw new Error("DEO_API_KEY or DEO_API_BASE not set");
  }
  const root = base.replace(/\/$/, "");
  const url = root.endsWith("/v1")
    ? `${root}/chat/completions`
    : `${root}/v1/chat/completions`;
  return openAiCompatibleOneWord({ url, apiKey, model, userPayload });
}

/** Default when GEMINI_MODEL / GOOGLE_GENERATIVE_AI_MODEL unset. */
const GEMINI_GENERATE_DEFAULT = "gemini-2.5-flash";

/**
 * Gemini 1.5 bare IDs often 404 on v1beta generateContent; remap to current models.
 * @param {string} rawModel
 */
function resolveGeminiGenerateModelId(rawModel) {
  const trimmed = String(rawModel ?? "").trim();
  const base = trimmed.startsWith("models/")
    ? trimmed.slice("models/".length)
    : trimmed;
  const id = base === "" ? GEMINI_GENERATE_DEFAULT : base;
  const aliases = {
    "gemini-1.5-flash": GEMINI_GENERATE_DEFAULT,
    "gemini-1.5-flash-latest": GEMINI_GENERATE_DEFAULT,
    "gemini-1.5-flash-001": GEMINI_GENERATE_DEFAULT,
    "gemini-1.5-flash-002": GEMINI_GENERATE_DEFAULT,
    "gemini-1.5-pro": "gemini-2.5-pro",
    "gemini-1.5-pro-latest": "gemini-2.5-pro",
    "gemini-1.5-pro-001": "gemini-2.5-pro",
    "gemini-1.5-pro-002": "gemini-2.5-pro",
    "gemini-pro": GEMINI_GENERATE_DEFAULT,
    "gemini-flash": GEMINI_GENERATE_DEFAULT,
  };
  return aliases[id] ?? id;
}

/** Google Gemini — fifth seat when GEMINI_* / GOOGLE_GENERATIVE_AI_* key is set. */
export async function voteGemini(userPayload) {
  const apiKey =
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY not set",
    );
  }

  const configured =
    process.env.GEMINI_MODEL?.trim() ||
    process.env.GOOGLE_GENERATIVE_AI_MODEL?.trim() ||
    "";
  const id = resolveGeminiGenerateModelId(configured);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(id)}:generateContent`;

  const userText =
    "Market telemetry (JSON). Reply one word only: BUY, HOLD, or SELL.\n\n" +
    JSON.stringify(userPayload);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: COUNCIL_SYSTEM_PROMPT }],
      },
      contents: [{ role: "user", parts: [{ text: userText }] }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 16,
      },
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    const hint429 =
      res.status === 429
        ? " Quota/rate limit: confirm billing and limits at https://ai.google.dev/gemini-api/docs/rate-limits — or wait for retry-after and/or set GEMINI_MODEL to another allowed model."
        : "";
    const hint404 =
      res.status === 404
        ? " Unknown or retired model id — use GEMINI_MODEL from https://ai.google.dev/gemini-api/docs/models or list: GET https://generativelanguage.googleapis.com/v1beta/models"
        : "";
    throw new Error(`Gemini ${res.status}: ${t}${hint429}${hint404}`);
  }

  const json = await res.json();
  const cand = json.candidates?.[0];
  const text =
    cand?.content?.parts?.map((p) => p.text).filter(Boolean).join("") ?? "";
  if (!text && json.promptFeedback?.blockReason) {
    throw new Error(`Gemini blocked: ${json.promptFeedback.blockReason}`);
  }
  return parseCouncilVote(text);
}

/** Prefer Gemini when configured; otherwise OpenAI-compatible Deo slot. */
export async function voteDeoOrGemini(userPayload) {
  const hasGemini =
    !!(process.env.GEMINI_API_KEY?.trim() ||
      process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim());
  if (hasGemini) return voteGemini(userPayload);
  return voteDeo(userPayload);
}

export const COUNCIL_MODEL_KEYS = [
  "claude",
  "gpt",
  "grok",
  "ollama",
  "deo",
];

/** Manual history study — multi-sentence answers (not one-word). */
export const STUDY_HISTORY_SYSTEM_PROMPT =
  "You are a macro-aware wave analyst. Given summarized historical price structure and context, identify recurring momentum / wave regimes by era (approximate date ranges). Reference velocity-of-trends and volatility shifts. Be concise: short bullets, no investment advice.";

export async function expandedOpenAI(systemStr, userStr) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");
  let base = process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1";
  base = base.replace(/\/$/, "");
  const url = base.endsWith("/v1")
    ? `${base}/chat/completions`
    : `${base}/v1/chat/completions`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.25,
      max_tokens: 900,
      messages: [
        { role: "system", content: systemStr },
        { role: "user", content: userStr },
      ],
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return String(json.choices?.[0]?.message?.content ?? "").trim();
}

export async function expandedClaude(systemStr, userStr) {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  const model =
    process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-20250514";
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1200,
      temperature: 0.25,
      system: systemStr,
      messages: [{ role: "user", content: userStr }],
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  const text = json.content?.find((b) => b.type === "text")?.text;
  return String(text ?? "").trim();
}

export async function expandedGrok(systemStr, userStr) {
  const apiKey = process.env.XAI_API_KEY?.trim();
  const model = process.env.XAI_MODEL ?? "grok-3-latest";
  if (!apiKey) throw new Error("XAI_API_KEY not set");
  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.25,
      max_tokens: 900,
      messages: [
        { role: "system", content: systemStr },
        { role: "user", content: userStr },
      ],
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return String(json.choices?.[0]?.message?.content ?? "").trim();
}

export async function expandedOllama(systemStr, userStr) {
  const host = (process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434").replace(
    /\/$/,
    "",
  );
  const model = process.env.OLLAMA_MODEL?.trim() || "llama3.2:latest";
  const res = await fetch(`${host}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      options: { temperature: 0.25 },
      messages: [
        { role: "system", content: systemStr },
        { role: "user", content: userStr },
      ],
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return String(json.message?.content ?? "").trim();
}

export async function expandedGemini(systemStr, userStr) {
  const apiKey =
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY not set",
    );
  }

  const configured =
    process.env.GEMINI_MODEL?.trim() ||
    process.env.GOOGLE_GENERATIVE_AI_MODEL?.trim() ||
    "";
  const id = resolveGeminiGenerateModelId(configured);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(id)}:generateContent`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemStr }] },
      contents: [{ role: "user", parts: [{ text: userStr }] }],
      generationConfig: {
        temperature: 0.25,
        maxOutputTokens: 1200,
      },
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    const hint404 =
      res.status === 404
        ? " Unknown or retired GEMINI_MODEL — see https://ai.google.dev/gemini-api/docs/models"
        : "";
    throw new Error(`Gemini ${res.status}: ${t}${hint404}`);
  }
  const json = await res.json();
  const cand = json.candidates?.[0];
  return String(
    cand?.content?.parts?.map((p) => p.text).filter(Boolean).join("") ?? "",
  ).trim();
}

export async function expandedDeoOrGemini(systemStr, userStr) {
  const hasGemini =
    !!(process.env.GEMINI_API_KEY?.trim() ||
      process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim());
  if (hasGemini) return expandedGemini(systemStr, userStr);
  return expandedDeo(systemStr, userStr);
}

export async function expandedDeo(systemStr, userStr) {
  const apiKey = process.env.DEO_API_KEY?.trim();
  const base = process.env.DEO_API_BASE?.trim();
  const model = process.env.DEO_MODEL?.trim() || "gpt-4o-mini";
  if (!apiKey || !base) throw new Error("DEO not configured");
  const root = base.replace(/\/$/, "");
  const url = root.endsWith("/v1")
    ? `${root}/chat/completions`
    : `${root}/v1/chat/completions`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.25,
      max_tokens: 900,
      messages: [
        { role: "system", content: systemStr },
        { role: "user", content: userStr },
      ],
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return String(json.choices?.[0]?.message?.content ?? "").trim();
}
