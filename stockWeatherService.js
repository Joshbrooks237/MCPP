import { getSignal } from "./signalEngine.js";
import { fetchHeadlinesForAsset } from "./newsHeadlines.js";
import {
  coingeckoSimpleUsd,
  fetchFearGreedIndex,
  fetchBtcDominance,
} from "./cryptoMarketData.js";
import {
  voteClaude,
  voteOpenAI,
  voteGrok,
  voteOllama,
  voteDeo,
  STUDY_HISTORY_SYSTEM_PROMPT,
  expandedClaude,
  expandedOpenAI,
  expandedGrok,
  expandedOllama,
  expandedDeo,
} from "./councilOneWordVote.js";
import { alpacaPaperMarketNotional } from "./alpacaPaperOrders.js";
import { yahoo } from "./yahooClient.js";
import { withRetry } from "./yahooRetry.js";

export const STOCK_WEATHER_ASSETS = [
  { ticker: "TSLA", feed: "TSLA", kind: "stock", cgId: null },
  { ticker: "AAPL", feed: "AAPL", kind: "stock", cgId: null },
  { ticker: "BTC", feed: "BTC-USD", kind: "crypto", cgId: "bitcoin" },
  { ticker: "ETH", feed: "ETH-USD", kind: "crypto", cgId: "ethereum" },
];

const POLL_MS = 90_000;
const LOG_CAP = 50;

let snapshots = {};
let cryptoGlobals = {
  fearGreed: null,
  btcDominance: null,
  cgUsd: {},
  fetchedAt: null,
};

let pollInProgress = false;
let lastPollAt = null;
let lastPollError = null;

const assetState = {};

let decisionLog = [];

let studyCache = {};

let paperPositions = [];

let schedulerHandle = null;

function rsiHeatLabel(rsi) {
  if (!Number.isFinite(rsi)) return "—";
  if (rsi < 35) return "Cool";
  if (rsi > 65) return "Hot";
  return "Balanced";
}

function consensusFromVotes(voteMap) {
  const counts = { BUY: 0, HOLD: 0, SELL: 0 };
  for (const v of Object.values(voteMap)) {
    if (v === "BUY" || v === "SELL" || v === "HOLD") counts[v] += 1;
  }
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const top = ranked[0][1];
  const tied = ranked.filter(([, n]) => n === top).map(([k]) => k);
  if (tied.length > 1) return { consensus: "HOLD", counts };
  return { consensus: ranked[0][0], counts };
}

async function refreshCryptoGlobals() {
  const [fg, dom, cg] = await Promise.all([
    fetchFearGreedIndex().catch(() => null),
    fetchBtcDominance().catch(() => NaN),
    coingeckoSimpleUsd(["bitcoin", "ethereum"]).catch(() => ({})),
  ]);
  cryptoGlobals = {
    fearGreed: fg,
    btcDominance: Number.isFinite(dom) ? dom : null,
    cgUsd: {
      BTC: cg?.bitcoin?.usd,
      ETH: cg?.ethereum?.usd,
    },
    fetchedAt: Date.now(),
  };
}

function buildCouncilPayload({
  ticker,
  kind,
  signal,
  headlines,
  prevSnap,
}) {
  const extraCrypto =
    kind === "crypto"
      ? {
          fear_greed_index: cryptoGlobals.fearGreed?.value ?? null,
          fear_greed_label: cryptoGlobals.fearGreed?.label ?? null,
          btc_dominance_pct: cryptoGlobals.btcDominance,
          coingecko_usd:
            ticker === "BTC"
              ? cryptoGlobals.cgUsd.BTC
              : ticker === "ETH"
                ? cryptoGlobals.cgUsd.ETH
                : null,
        }
      : {};

  const full = {
    ticker,
    asset_class: kind,
    price: signal.price,
    velocity: signal.velocity,
    acceleration: signal.acceleration,
    rsi: signal.rsi,
    bollinger_position: signal.bollinger_position,
    wave_state: signal.wave_state,
    wave_phase: signal.wave_phase,
    headlines,
    ...extraCrypto,
  };

  let delta = {};
  if (prevSnap && typeof prevSnap === "object") {
    for (const key of Object.keys(full)) {
      if (key === "headlines") {
        delta.latest_headlines = headlines;
        continue;
      }
      const a = full[key];
      const b = prevSnap[key];
      if (JSON.stringify(a) !== JSON.stringify(b)) delta[key] = a;
    }
  } else {
    delta = { ...full };
  }

  return {
    poll_note:
      "DELTA lists fields that changed since last 90s poll; FULL is authoritative snapshot.",
    DELTA: delta,
    FULL: full,
  };
}

async function runVotesForPayload(payload) {
  const tasks = [
    ["claude", () => voteClaude(payload)],
    ["gpt", () => voteOpenAI(payload)],
    ["grok", () => voteGrok(payload)],
    ["ollama", () => voteOllama(payload)],
    ["deo", () => voteDeo(payload)],
  ];

  const votes = {};
  const errors = {};
  const settled = await Promise.allSettled(tasks.map(([, fn]) => fn()));

  settled.forEach((result, i) => {
    const key = tasks[i][0];
    if (result.status === "fulfilled") votes[key] = result.value;
    else errors[key] = String(result.reason?.message ?? result.reason);
  });

  return { votes, errors };
}

function cardFromSignal(ticker, kind, signal, cgSpot) {
  const price =
    kind === "crypto" && Number.isFinite(cgSpot) ? cgSpot : signal.price;
  const bb = signal.bollinger_position;
  const bbPct = Number.isFinite(bb) ? Math.round(bb * 100) : null;
  return {
    ticker,
    kind,
    price,
    rsi: signal.rsi,
    rsiLabel: rsiHeatLabel(signal.rsi),
    bollinger_position: bb,
    bbPercent: bbPct,
    wave_state: signal.wave_state,
    updatedAt: Date.now(),
  };
}

export async function runCouncilCycle() {
  if (pollInProgress) return { skipped: true, reason: "already_running" };
  pollInProgress = true;
  lastPollError = null;

  try {
    await refreshCryptoGlobals();
    const stamp = Date.now();

    const results = await Promise.all(
      STOCK_WEATHER_ASSETS.map(async (meta) => {
        const { ticker, feed, kind } = meta;
        try {
          const signal = await getSignal(feed);
          const headlines = await fetchHeadlinesForAsset(ticker, kind);
          const cgSpot =
            kind === "crypto"
              ? ticker === "BTC"
                ? cryptoGlobals.cgUsd.BTC
                : cryptoGlobals.cgUsd.ETH
              : null;

          const prev = snapshots[ticker] ?? null;
          const payload = buildCouncilPayload({
            ticker,
            kind,
            signal,
            headlines,
            prevSnap: prev,
          });

          const { votes, errors } = await runVotesForPayload(payload);
          const { consensus, counts } = consensusFromVotes(votes);

          snapshots[ticker] = { ...payload.FULL };

          const card = cardFromSignal(ticker, kind, signal, cgSpot);

          assetState[ticker] = {
            card,
            council: {
              votes,
              errors,
              consensus,
              counts,
              updatedAt: stamp,
            },
            headlines,
          };

          return {
            timestamp: stamp,
            asset: ticker,
            consensus,
            breakdown: { ...counts },
            votes: { ...votes },
          };
        } catch (e) {
          assetState[ticker] = {
            card: assetState[ticker]?.card ?? {
              ticker,
              kind,
              error: String(e.message),
            },
            council: {
              error: String(e.message ?? e),
              updatedAt: stamp,
            },
            error: String(e.message ?? e),
          };
          return null;
        }
      }),
    );

    const logBatch = results.filter(Boolean);

    decisionLog.unshift(...logBatch);
    decisionLog = decisionLog.slice(0, LOG_CAP);
    lastPollAt = stamp;
    updatePaperMarks();
    return { ok: true, lastPollAt: stamp };
  } catch (e) {
    lastPollError = String(e.message ?? e);
    return { ok: false, error: lastPollError };
  } finally {
    pollInProgress = false;
  }
}

function updatePaperMarks() {
  for (const pos of paperPositions) {
    const c = assetState[pos.ticker]?.card?.price;
    if (Number.isFinite(c)) pos.lastMark = c;
    if (
      pos.side === "buy" &&
      Number.isFinite(pos.entryPrice) &&
      Number.isFinite(pos.lastMark)
    ) {
      const qty = pos.qty ?? pos.usd / pos.entryPrice;
      pos.unrealizedPnL = (pos.lastMark - pos.entryPrice) * qty;
    }
  }
}

export function getStockWeatherState() {
  return {
    pollInProgress,
    lastPollAt,
    lastPollError,
    pollIntervalMs: POLL_MS,
    cryptoGlobals,
    assets: STOCK_WEATHER_ASSETS.map((m) => ({
      meta: m,
      ...assetState[m.ticker],
    })),
    decisionLog,
    paperPositions,
    studyCache: { ...studyCache },
  };
}

export async function runHistoryStudy(ticker) {
  const t = String(ticker).toUpperCase();
  const meta = STOCK_WEATHER_ASSETS.find((a) => a.ticker === t);
  if (!meta) throw new Error("Unknown ticker");

  const closes = await withRetry(
    async () => {
      const result = await yahoo.chart(
        meta.feed,
        { interval: "1d", range: "2y" },
        { validateOptions: false },
      );
      const q = result.quotes || [];
      return q
        .map((x) => x.close)
        .filter((v) => v != null && Number.isFinite(Number(v)))
        .map(Number);
    },
    2,
    800,
    "Yahoo study chart",
  );

  if (closes.length < 40) throw new Error("Not enough daily history");

  const first = closes[0];
  const last = closes.at(-1);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const summary = {
    ticker: t,
    trading_symbol: meta.feed,
    bars: closes.length,
    first_close: first,
    last_close: last,
    min_close: min,
    max_close: max,
    pct_change_full_window:
      first !== 0 ? ((last - first) / first) * 100 : null,
    last_20_slice: closes.slice(-20),
  };

  const userText =
    "Historical daily closes summary (numeric facts only). Identify recurring wave regimes by era.\n\n" +
    JSON.stringify(summary, null, 2);

  const runners = [
    ["claude", () => expandedClaude(STUDY_HISTORY_SYSTEM_PROMPT, userText)],
    ["gpt", () => expandedOpenAI(STUDY_HISTORY_SYSTEM_PROMPT, userText)],
    ["grok", () => expandedGrok(STUDY_HISTORY_SYSTEM_PROMPT, userText)],
    ["ollama", () => expandedOllama(STUDY_HISTORY_SYSTEM_PROMPT, userText)],
    ["deo", () => expandedDeo(STUDY_HISTORY_SYSTEM_PROMPT, userText)],
  ];

  const answers = {};
  const errors = {};
  const settled = await Promise.allSettled(runners.map(([, fn]) => fn()));
  settled.forEach((res, i) => {
    const key = runners[i][0];
    if (res.status === "fulfilled") answers[key] = res.value;
    else errors[key] = String(res.reason?.message ?? res.reason);
  });

  studyCache[t] = {
    updatedAt: Date.now(),
    answers,
    errors,
    summaryBars: closes.length,
  };
  return studyCache[t];
}

export async function paperTradeConsensus(ticker, usd = 50) {
  const t = String(ticker).toUpperCase();
  const row = assetState[t]?.council;
  if (!row || !row.consensus) {
    throw new Error("No consensus yet — wait for council poll");
  }
  const c = row.consensus;
  if (c === "HOLD") throw new Error("Consensus is HOLD — no directional trade");

  const side = c === "BUY" ? "buy" : "sell";
  const card = assetState[t]?.card;
  const mark = card?.price;
  if (!Number.isFinite(mark) || mark <= 0) throw new Error("No live price");

  const order = await alpacaPaperMarketNotional({
    ticker: t,
    usd,
    side,
  });

  const qty = usd / mark;
  paperPositions.push({
    id: `${Date.now()}-${t}`,
    ticker: t,
    side,
    usd,
    qty,
    entryPrice: mark,
    consensus: c,
    openedAt: Date.now(),
    alpacaOrderId: order.id ?? order.order?.id ?? null,
    lastMark: mark,
    unrealizedPnL: 0,
  });

  return { order, position: paperPositions.at(-1) };
}

export function startStockWeatherScheduler() {
  if (schedulerHandle) return;
  schedulerHandle = setInterval(() => {
    runCouncilCycle().catch((e) =>
      console.error("[stock-weather poll]", e),
    );
  }, POLL_MS);
  runCouncilCycle().catch((e) =>
    console.error("[stock-weather boot poll]", e),
  );
}
