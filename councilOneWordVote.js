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
  const model = process.env.OLLAMA_MODEL?.trim() || "llama3.2";
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
    throw new Error(`Ollama ${res.status}: ${t}`);
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
  const model = process.env.OLLAMA_MODEL?.trim() || "llama3.2";
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
