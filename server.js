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
} from "./paperSimService.js";
import { initializePortfolio } from "./paperPortfolio.js";

import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const PORT = Number(process.env.PORT) || 3000;

app.get("/signals", async (req, res) => {
  try {
    const data = await runEngine();
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Error generating signals",
      detail: String(err.message ?? err),
    });
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
    res.status(500).json({ error: String(err.message ?? err) });
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
    initializePortfolio(req.body?.amount);
    resetPaperSimTickCounter();
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: String(err.message ?? err) });
  }
});

app.post("/paper-sim/tick", async (req, res) => {
  try {
    const forceAi = req.body?.forceAi !== false;
    const out = await runPaperSimTick(forceAi);
    res.json(out);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err.message ?? err) });
  }
});

app.get("/paper-sim/state", async (_req, res) => {
  try {
    const out = await getPaperSimStateLive();
    res.json(out);
  } catch (err) {
    res.status(500).json({ error: String(err.message ?? err) });
  }
});

app.post("/council/sim/reset", (_req, res) => {
  try {
    resetAllPortfolios();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err.message ?? err) });
  }
});

app.get("/council/dashboard", (_req, res) => {
  try {
    res.json(getCouncilDashboardData());
  } catch (err) {
    res.status(500).json({ error: String(err.message ?? err) });
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
    res.status(500).json({ error: String(err.message ?? err) });
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
    res.status(500).json({ error: String(err.message ?? err) });
  }
});

app.get("/predictions", async (_req, res) => {
  try {
    res.json(readTrades());
  } catch (err) {
    res.status(500).json({ error: String(err.message ?? err) });
  }
});

app.get("/predictions/:id", async (req, res) => {
  try {
    const row = readTrades().find((r) => r.id === req.params.id);
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: String(err.message ?? err) });
  }
});

app.post("/predictions/process-checkpoints", async (_req, res) => {
  try {
    const out = await processDueCheckpoints();
    res.json(out);
  } catch (err) {
    res.status(500).json({ error: String(err.message ?? err) });
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
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`GET  /           (easy dashboard)`);
  console.log(`GET  /signals`);
  console.log(`POST /signals/log`);
  console.log(`POST /analyze`);
  console.log(`GET  /predictions`);
  console.log(`POST /predictions/process-checkpoints`);
  console.log(
    `Rolling marketRecorder every ${MARKET_INTERVAL_MS / 60000}m → ./marketData.json (${SYMBOLS.join(", ")})`,
  );
});
