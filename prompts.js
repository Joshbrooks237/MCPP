/**
 * Prompts embed ONLY {{DATA}} replaced with JSON.stringify({ market_state }).
 */

export const PROMPT_OPENAI_SYNTHESIZER = `You are analyzing a financial instrument.

Input (JSON only, single object):
{{DATA}}

The object has key "market_state" with:
- wave_state — cycle / trend regime label
- wave_phase — numeric phase in [0, 1]
- current_direction — long-horizon drift UP or DOWN (or null if unavailable)
- current_strength — magnitude of drift proxy
- volatility — recent path volatility proxy

Rules:
- DO NOT guess randomly
- DO NOT use external knowledge
- ONLY reason from market_state

Task:
Decide BUY / SELL / HOLD.

Also:
1. Confirm or refine wave state (trend, peak forming, trough forming, or neutral)
2. State whether momentum is strengthening or weakening
3. Provide a confidence score (0 to 1)

Return JSON only:

{
  "wave_state": "",
  "momentum": "",
  "action": "",
  "confidence": 0.0,
  "reasoning": []
}`;

export const PROMPT_CLAUDE_SKEPTIC = `You are analyzing a financial instrument.

Input (JSON only, single object):
{{DATA}}

The object has key "market_state" with wave_state, wave_phase, current_direction, current_strength, volatility (same meanings as in the synthesizer prompt).

You are a risk analyst. DISPROVE a proposed trade using ONLY this input.

Rules:
- Be critical and cautious
- Assume the trade could be wrong
- Identify hidden risks or weak signals

Task:
1. Identify weaknesses in the signal
2. Explain scenarios where this trade fails
3. Output a risk level: LOW, MEDIUM, HIGH

Return JSON only:

{
  "risk_level": "",
  "issues": [],
  "counter_scenarios": []
}`;

export const PROMPT_XAI_ANOMALY = `You are analyzing a financial instrument.

Input (JSON only, single object):
{{DATA}}

The object has key "market_state" with wave_state, wave_phase, current_direction, current_strength, volatility.

You are a market behavior analyst.

Focus on whether the current structure reflects:
- natural cyclical movement
- or abnormal / event-driven behavior

Task:
1. Determine if movement is NORMAL or ANOMALOUS
2. If anomalous, explain why
3. Flag whether trading should be avoided

Return JSON:

{
  "behavior": "NORMAL or ANOMALOUS",
  "avoid_trade": true/false,
  "notes": []
}`;

export const PROMPT_OLLAMA_PATTERN_MINER = `You are analyzing historical trade signals.

Find patterns where:
- SELL signals succeeded
- SELL signals failed

Return:
- conditions that increase success rate
- conditions that decrease success rate`;

export const PROMPT_ANALYZE_LOSING_TRADES = `Here are failed trades from a backtest.

Each trade includes at entry or exit bar:
- velocity
- acceleration
- RSI
- Bollinger band position (0–1)
- realized percent return on the round-trip

Task:
- Find patterns in losing trades (what repeats before losses).
- What conditions should be avoided or filtered before entering?

Rules:
- Reason only from the numbers provided.
- Do not invent fundamentals or news.

Return JSON only:

{
  "conditions_to_avoid": [],
  "suggested_filters": [],
  "notes": []
}

Failed trades:

{{TRADES}}`;
