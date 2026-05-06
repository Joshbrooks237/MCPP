import { useCallback, useEffect, useRef, useState } from "react";

const API = "/paper-sim";
const PRESET_STORAGE_KEY = "mcpp-paper-sim-preset-v1";

type PaperMarket = "equities" | "crypto";

type SavedPaperPreset = {
  portfolioName: string;
  amount: string;
  market: PaperMarket;
};

function loadPaperPreset(): SavedPaperPreset | null {
  try {
    const raw = localStorage.getItem(PRESET_STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<SavedPaperPreset>;
    if (typeof p.amount !== "string") return null;
    const market =
      p.market === "crypto" || p.market === "equities"
        ? p.market
        : "equities";
    return {
      portfolioName:
        typeof p.portfolioName === "string" ? p.portfolioName : "",
      amount: p.amount,
      market,
    };
  } catch {
    return null;
  }
}

function savePaperPreset(preset: SavedPaperPreset) {
  try {
    localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(preset));
  } catch {
    /* quota / private mode */
  }
}

function clearPaperPreset() {
  try {
    localStorage.removeItem(PRESET_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function apiErrorMessage(j: { error?: unknown }, fallback: string): string {
  const e = j?.error;
  if (typeof e === "string") return e;
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  return fallback;
}

function formatUsd(n: number | undefined) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

type TickPayload = {
  market: PaperMarket;
  assetOrder: string[];
  symbolEvaluated: string;
  feedEvaluated?: string;
  prices: Record<string, number>;
  decision: { action: string; confidence?: number };
  reason: string;
  portfolio: {
    startingBalance: number;
    balance: number;
    position: { symbol: string; shares: number; entryPrice: number } | null;
    unrealizedPnL: number;
    totalValue: number;
    pnlDollar: number;
    pnlPct: number;
  };
};

export function PaperSim() {
  const [portfolioName, setPortfolioName] = useState("");
  const [amountInput, setAmountInput] = useState("200");
  const [market, setMarket] = useState<PaperMarket>("equities");
  const [presetHydrated, setPresetHydrated] = useState(false);
  const [started, setStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tickData, setTickData] = useState<TickPayload | null>(null);
  const [loadingTick, setLoadingTick] = useState(false);
  const [cashTickUp, setCashTickUp] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevTotalRef = useRef<number | null>(null);

  const resetCashTracking = useCallback(() => {
    prevTotalRef.current = null;
    setCashTickUp(false);
  }, []);

  const stopLoop = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const runTick = useCallback(async () => {
    setLoadingTick(true);
    setError(null);
    try {
      const res = await fetch(`${API}/tick`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forceAi: true }),
      });
      const j = await res.json();
      if (!res.ok)
        throw new Error(apiErrorMessage(j, res.statusText));
      setTickData(j);
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setLoadingTick(false);
    }
  }, []);

  const handleStart = async () => {
    setError(null);
    stopLoop();
    const n = Number(amountInput);
    if (!Number.isFinite(n) || n <= 0) {
      setError("Enter a positive starting amount.");
      return;
    }
    try {
      const res = await fetch(`${API}/init`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: n, market }),
      });
      const j = await res.json();
      if (!res.ok)
        throw new Error(apiErrorMessage(j, res.statusText));
      setStarted(true);
      savePaperPreset({
        portfolioName: portfolioName.trim(),
        amount: amountInput,
        market,
      });
      setTickData(null);
      resetCashTracking();
      await runTick();
      timerRef.current = setInterval(runTick, 12000);
    } catch (e) {
      setError(String((e as Error).message ?? e));
    }
  };

  useEffect(() => () => stopLoop(), [stopLoop]);

  useEffect(() => {
    const preset = loadPaperPreset();
    if (preset) {
      setPortfolioName(preset.portfolioName);
      setAmountInput(preset.amount);
      setMarket(preset.market);
    }
    setPresetHydrated(true);
  }, []);

  useEffect(() => {
    if (!presetHydrated) return;
    const id = window.setTimeout(() => {
      savePaperPreset({
        portfolioName: portfolioName.trim(),
        amount: amountInput,
        market,
      });
    }, 400);
    return () => clearTimeout(id);
  }, [presetHydrated, portfolioName, amountInput, market]);

  useEffect(() => {
    const v = tickData?.portfolio?.totalValue;
    if (typeof v !== "number" || !Number.isFinite(v)) return;

    const prev = prevTotalRef.current;
    prevTotalRef.current = v;

    if (prev !== null && v > prev) {
      setCashTickUp(true);
      const id = window.setTimeout(() => setCashTickUp(false), 900);
      return () => clearTimeout(id);
    }
  }, [tickData?.portfolio?.totalValue]);

  if (!started) {
    return (
      <div className="w-full max-w-md mx-auto rounded-xl border border-emerald-900/80 bg-slate-950 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-emerald-100">Paper portfolio</h2>
        <label className="block text-sm text-slate-400">
          Saved name (optional)
          <input
            type="text"
            placeholder="e.g. Demo run"
            value={portfolioName}
            onChange={(e) => setPortfolioName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 placeholder:text-slate-600"
          />
        </label>
        <p className="text-[11px] text-slate-600 leading-snug">
          Name and starting balance are remembered on this browser.
        </p>
        <label className="block text-sm text-slate-400">
          Starting balance ($)
          <input
            type="number"
            min={1}
            step="any"
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"
          />
        </label>
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Universe (same AI council)
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMarket("equities")}
              className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                market === "equities"
                  ? "border-emerald-500 bg-emerald-950/50 text-emerald-100"
                  : "border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-600"
              }`}
            >
              <span className="font-semibold block">Equities</span>
              <span className="text-xs opacity-80">AAPL · TSLA</span>
            </button>
            <button
              type="button"
              onClick={() => setMarket("crypto")}
              className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                market === "crypto"
                  ? "border-emerald-500 bg-emerald-950/50 text-emerald-100"
                  : "border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-600"
              }`}
            >
              <span className="font-semibold block">Crypto</span>
              <span className="text-xs opacity-80">BTC · ETH · ~24h</span>
            </button>
          </div>
          <p className="text-[11px] text-slate-600 leading-snug">
            Use crypto when US stocks are closed — still exercises the full pipeline on live bars.
          </p>
        </div>
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button
          type="button"
          onClick={handleStart}
          className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3"
        >
          Start portfolio
        </button>
        <button
          type="button"
          onClick={() => {
            clearPaperPreset();
            setPortfolioName("");
            setAmountInput("200");
            setMarket("equities");
          }}
          className="w-full text-xs text-slate-500 hover:text-slate-400 underline"
        >
          Clear saved preset
        </button>
        <p className="text-xs text-slate-500">
          Backend on port 3000 (Vite proxies{" "}
          <code className="text-slate-400">/paper-sim</code>).
        </p>
      </div>
    );
  }

  const p = tickData?.portfolio;
  const prices = tickData?.prices;
  const assetOrder =
    tickData?.assetOrder ?? (market === "crypto" ? ["BTC", "ETH"] : ["AAPL", "TSLA"]);
  const liveMarket = tickData?.market ?? market;

  const fmtPx = (id: string) => {
    const n = prices?.[id];
    if (typeof n !== "number" || !Number.isFinite(n)) return "—";
    return n.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  return (
    <div className="w-full max-w-lg mx-auto space-y-4">
      <div className="flex justify-between items-center gap-2 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-emerald-100">Live paper sim</h2>
          {portfolioName.trim() ? (
            <p className="text-xs text-slate-500 truncate max-w-[14rem] sm:max-w-xs">
              {portfolioName.trim()}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border ${
              liveMarket === "crypto"
                ? "border-violet-500/60 text-violet-300 bg-violet-950/40"
                : "border-sky-500/60 text-sky-300 bg-sky-950/40"
            }`}
          >
            {liveMarket === "crypto" ? "Crypto" : "Equities"}
          </span>
          <button
            type="button"
            onClick={() => {
              stopLoop();
              resetCashTracking();
              setStarted(false);
              setTickData(null);
            }}
            className="text-xs text-slate-400 underline"
          >
            Reset
          </button>
        </div>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <div
        className={`relative overflow-hidden rounded-2xl border-2 border-emerald-500/50 bg-gradient-to-b from-emerald-950 via-slate-950 to-slate-950 px-5 py-7 shadow-[0_0_36px_rgba(16,185,129,0.22)] ${cashTickUp ? "paper-cash-hero--tick-up" : ""}`}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(-12deg, transparent, transparent 12px, rgba(52,211,153,0.9) 12px, rgba(52,211,153,0.9) 13px)",
          }}
        />
        <p className="relative text-center text-xs font-semibold uppercase tracking-[0.35em] text-emerald-400/90">
          Cash stack
        </p>
        <p
          className="relative mt-1 text-center font-black tabular-nums tracking-tight text-emerald-300 sm:text-6xl text-5xl leading-none drop-shadow-[0_0_28px_rgba(52,211,153,0.5)]"
          aria-live="polite"
          aria-label={`Portfolio total ${formatUsd(p?.totalValue)}`}
        >
          {formatUsd(p?.totalValue)}
        </p>
        <p className="relative mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-sm text-emerald-100/80">
          <span>
            vs start{" "}
            <strong
              className={
                (p?.pnlDollar ?? 0) >= 0 ? "text-emerald-300" : "text-rose-300"
              }
            >
              {(p?.pnlDollar ?? 0) >= 0 ? "+" : ""}
              {formatUsd(p?.pnlDollar)}
            </strong>
          </span>
          <span className="text-emerald-600/80">·</span>
          <span>
            <strong
              className={
                (p?.pnlPct ?? 0) >= 0 ? "text-emerald-300" : "text-rose-300"
              }
            >
              {(p?.pnlPct ?? 0) >= 0 ? "+" : ""}
              {p?.pnlPct?.toFixed(2) ?? "—"}%
            </strong>
          </span>
        </p>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-4 space-y-2">
        <h3 className="text-emerald-400 text-sm font-medium">Portfolio</h3>
        <p className="text-slate-300 text-sm">
          Starting:{" "}
          <strong>${p?.startingBalance?.toFixed(2) ?? "—"}</strong>
        </p>
        <p className="text-slate-300 text-sm">
          Cash: <strong>${p?.balance?.toFixed(2) ?? "—"}</strong>
        </p>
        <p className="text-slate-300 text-sm">
          Total value:{" "}
          <strong>${p?.totalValue?.toFixed(2) ?? "—"}</strong>
        </p>
        <p className="text-slate-300 text-sm">
          PnL:{" "}
          <strong
            className={
              (p?.pnlDollar ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"
            }
          >
            ${p?.pnlDollar?.toFixed(2) ?? "—"} ({p?.pnlPct?.toFixed(2) ?? "—"}%)
          </strong>
        </p>
        {loadingTick && (
          <p className="text-xs text-slate-500">Updating council tick…</p>
        )}
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-4 space-y-1">
        <h3 className="text-sky-400 text-sm font-medium">Prices</h3>
        {assetOrder.map((id) => (
          <p key={id} className="text-slate-200">
            {id}{" "}
            <strong>${fmtPx(id)}</strong>
          </p>
        ))}
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-4 space-y-1">
        <h3 className="text-amber-400 text-sm font-medium">Position</h3>
        <p className="text-slate-200">
          Symbol:{" "}
          <strong>{p?.position?.symbol ?? "NONE"}</strong>
        </p>
        <p className="text-slate-300 text-sm">
          Entry:{" "}
          <strong>
            {p?.position ? `$${p.position.entryPrice.toFixed(4)}` : "—"}
          </strong>
        </p>
        <p className="text-slate-300 text-sm">
          Unrealized PnL:{" "}
          <strong
            className={
              (p?.unrealizedPnL ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"
            }
          >
            ${p?.unrealizedPnL?.toFixed(2) ?? "0.00"}
          </strong>
        </p>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-4 space-y-2">
        <h3 className="text-violet-400 text-sm font-medium">Council decision</h3>
        <p className="text-slate-200">
          Action:{" "}
          <strong className="uppercase">{tickData?.decision?.action ?? "—"}</strong>
          {tickData?.symbolEvaluated && (
            <span className="text-slate-500 text-sm ml-2">
              (eval {tickData.symbolEvaluated})
            </span>
          )}
        </p>
        <p className="text-slate-400 text-sm leading-relaxed">
          Reason: {tickData?.reason ?? "—"}
        </p>
        <button
          type="button"
          onClick={runTick}
          disabled={loadingTick}
          className="mt-2 text-xs rounded-md border border-slate-600 px-3 py-1.5 text-slate-300 hover:bg-slate-800 disabled:opacity-50"
        >
          Run tick now
        </button>
      </div>
    </div>
  );
}
