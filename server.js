import "./cryptoPolyfill.js";
import "dotenv/config";
import express from "express";
import { runEngine, getSignal, SYMBOLS } from "./signalEngine.js";
import { runAiPipeline } from "./aiOrchestrator.js";
import { logSignal, readTrades } from "./logger.js";
import { processDueCheckpoints } from "./checkpointProcessor.js";
import { recordMarket } from "./marketRecorder.js";
import { shouldBlockTradeForNews } from "./newsGate.js";
import {
  runComparisonStep,
  getCouncilDashboardData,
  resetAllPortfolios,
} from "./comparisonEngine.js";
import {
  resetPaperSimTickCounter,
  runPaperSimTick,
  getPaperSimStateLive,
  setPaperSimMarket,
  getPaperSimMarket,
} from "./paperSimService.js";
import { initializePortfolio } from "./paperPortfolio.js";
import {
  getStockWeatherState,
  runCouncilCycle,
  runHistoryStudy,
  paperTradeConsensus,
  startStockWeatherScheduler,
} from "./stockWeatherService.js";

import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const PORT = Number(process.env.PORT) || 3000;

/** Structured JSON errors for API clients (`ok` + `error.name` / `error.message`). */
function jsonFail(res, status, err) {
  const message = String(err?.message ?? err);
  const name = err instanceof Error ? err.name : "Error";
  res.status(status).json({ ok: false, error: { name, message } });
}

app.get("/signals", async (req, res) => {
  try {
    const data = await runEngine();
    res.json(data);
  } catch (err) {
    console.error(err);
    jsonFail(res, 500, err);
  }
});

/** Log current signals only (no AI); checkpoints still run. */
app.post("/signals/log", async (req, res) => {
  try {
    const symbols = Array.isArray(req.body?.symbols)
      ? req.body.symbols
      : SYMBOLS;
    const logged = [];
    for (const symbol of symbols) {
      const signal = await getSignal(symbol);
      const row = logSignal(signal);
      logged.push(row);
    }
    res.json({ logged });
  } catch (err) {
    console.error(err);
    jsonFail(res, 500, err);
  }
});

/** Full pipeline: signals → multi-AI → decide → trades.json */
function readForceAi(req) {
  const b = req.body?.forceAi;
  const q = req.query?.forceAi;
  const truthy = (v) =>
    v === true ||
    v === 1 ||
    (typeof v === "string" && ["true", "1", "yes"].includes(v.toLowerCase()));
  return truthy(b) || truthy(q);
}

app.post("/paper-sim/init", (req, res) => {
  try {
    const m = req.body?.market;
    if (m === "crypto" || m === "equities") {
      setPaperSimMarket(m);
    } else if (m != null && String(m).trim() !== "") {
      throw new Error('market must be "equities" or "crypto"');
    } else {
      setPaperSimMarket("equities");
    }
    initializePortfolio(req.body?.amount);
    resetPaperSimTickCounter();
    res.json({ ok: true, market: getPaperSimMarket() });
  } catch (err) {
    jsonFail(res, 400, err);
  }
});

app.post("/paper-sim/tick", async (req, res) => {
  try {
    const forceAi = req.body?.forceAi !== false;
    const out = await runPaperSimTick(forceAi);
    res.json(out);
  } catch (err) {
    console.error(err);
    jsonFail(res, 500, err);
  }
});

app.get("/paper-sim/state", async (_req, res) => {
  try {
    const out = await getPaperSimStateLive();
    res.json(out);
  } catch (err) {
    jsonFail(res, 500, err);
  }
});

app.get("/stock-weather/state", (_req, res) => {
  try {
    res.json(getStockWeatherState());
  } catch (err) {
    jsonFail(res, 500, err);
  }
});

app.post("/stock-weather/poll", async (_req, res) => {
  try {
    const out = await runCouncilCycle();
    res.json(out);
  } catch (err) {
    jsonFail(res, 500, err);
  }
});

app.post("/stock-weather/study", async (req, res) => {
  try {
    const ticker = req.body?.ticker;
    if (!ticker) throw new Error("ticker required");
    const out = await runHistoryStudy(String(ticker));
    res.json({ ok: true, study: out });
  } catch (err) {
    jsonFail(res, 500, err);
  }
});

app.post("/stock-weather/paper-trade", async (req, res) => {
  try {
    const ticker = req.body?.ticker;
    if (!ticker) throw new Error("ticker required");
    const usd = Number(req.body?.usd) || 50;
    const out = await paperTradeConsensus(String(ticker), usd);
    res.json({ ok: true, ...out });
  } catch (err) {
    jsonFail(res, 400, err);
  }
});

app.post("/council/sim/reset", (_req, res) => {
  try {
    resetAllPortfolios();
    res.json({ ok: true });
  } catch (err) {
    jsonFail(res, 500, err);
  }
});

app.get("/council/dashboard", (_req, res) => {
  try {
    res.json(getCouncilDashboardData());
  } catch (err) {
    jsonFail(res, 500, err);
  }
});

app.post("/council/sim/step", async (req, res) => {
  try {
    const symbol =
      typeof req.body?.symbol === "string" ? req.body.symbol : SYMBOLS[0];
    const forceAi = readForceAi(req);
    const signal = await getSignal(symbol);
    const out = await runComparisonStep(signal, { forceAi });
    res.json(out);
  } catch (err) {
    console.error(err);
    jsonFail(res, 500, err);
  }
});

app.post("/analyze", async (req, res) => {
  try {
    const symbols = Array.isArray(req.body?.symbols)
      ? req.body.symbols
      : SYMBOLS;

    const forceAi = readForceAi(req);

    const results = [];

    for (const symbol of symbols) {
      const signal = await getSignal(symbol);

      let aiPack;
      const newsBlocked = await shouldBlockTradeForNews(symbol);

      if (newsBlocked) {
        aiPack = {
          openai: null,
          claude: null,
          xai: null,
          errors: {},
          finalDecision: "NO TRADE",
          ok: true,
          aiSkipped: true,
          aiSkipReason: "major_news_recent",
          newsBlocked: true,
          xaiStubbed: false,
          xai_available: false,
          used_local_anomaly: false,
          anomaly_flags: [],
          anomaly_source: "none",
          wave_state: signal.wave_state,
          wave_phase: signal.wave_phase,
          current: signal.current ?? null,
        };
      } else {
        aiPack = await runAiPipeline(signal, {
          forceAi,
        });
      }

      const row = logSignal(signal, {
        ai: {
          openai: aiPack.openai,
          claude: aiPack.claude,
          xai: aiPack.xai,
          xai_available: aiPack.xai_available ?? false,
          used_local_anomaly: aiPack.used_local_anomaly ?? false,
          anomaly_flags: aiPack.anomaly_flags ?? [],
          anomaly_source: aiPack.anomaly_source ?? "none",
          wave_state: aiPack.wave_state,
          wave_phase: aiPack.wave_phase,
          current: aiPack.current ?? null,
          ...(aiPack.newsBlocked ? { newsBlocked: true } : {}),
          ...(Object.keys(aiPack.errors ?? {}).length
            ? { errors: aiPack.errors }
            : {}),
          ...(aiPack.aiSkipped ? { aiSkipReason: aiPack.aiSkipReason } : {}),
        },
        finalDecision: aiPack.finalDecision,
      });

      results.push({
        signal,
        ...aiPack,
        predictionLogId: row.id,
      });
    }

    res.json({ results });
  } catch (err) {
    console.error(err);
    jsonFail(res, 500, err);
  }
});

app.get("/predictions", async (_req, res) => {
  try {
    res.json(readTrades());
  } catch (err) {
    jsonFail(res, 500, err);
  }
});

app.get("/predictions/:id", async (req, res) => {
  try {
    const row = readTrades().find((r) => r.id === req.params.id);
    if (!row) {
      return res
        .status(404)
        .json({ ok: false, error: { name: "NotFound", message: "Not found" } });
    }
    res.json(row);
  } catch (err) {
    jsonFail(res, 500, err);
  }
});

app.post("/predictions/process-checkpoints", async (_req, res) => {
  try {
    const out = await processDueCheckpoints();
    res.json(out);
  } catch (err) {
    jsonFail(res, 500, err);
  }
});

setInterval(() => {
  processDueCheckpoints().catch((e) =>
    console.error("checkpoint processor:", e),
  );
}, 60 * 1000);

const MARKET_INTERVAL_MS = 5 * 60 * 1000;

function tickMarketRecorder() {
  for (const sym of SYMBOLS) {
    recordMarket(sym).catch((e) =>
      console.error("[marketRecorder]", sym, e),
    );
  }
}

tickMarketRecorder();
setInterval(tickMarketRecorder, MARKET_INTERVAL_MS);

app.listen(PORT, () => {
  startStockWeatherScheduler();
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`GET  /           (easy dashboard)`);
  console.log(`GET  /signals`);
  console.log(`POST /signals/log`);
  console.log(`POST /analyze`);
  console.log(`GET  /predictions`);
  console.log(`POST /stock-weather/poll`);
  console.log(`POST /stock-weather/study`);
  console.log(`POST /stock-weather/paper-trade`);
  console.log(
    `Rolling marketRecorder every ${MARKET_INTERVAL_MS / 60000}m → ./marketData.json (${SYMBOLS.join(", ")})`,
  );
});
