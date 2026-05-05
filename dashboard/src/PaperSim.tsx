import { useCallback, useEffect, useRef, useState } from "react";

const API = "/paper-sim";

type TickPayload = {
  symbolEvaluated: string;
  prices: { AAPL: number; TSLA: number };
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
  const [amountInput, setAmountInput] = useState("200");
  const [started, setStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tickData, setTickData] = useState<TickPayload | null>(null);
  const [loadingTick, setLoadingTick] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
      if (!res.ok) throw new Error(j.error ?? res.statusText);
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
        body: JSON.stringify({ amount: n }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? res.statusText);
      setStarted(true);
      setTickData(null);
      await runTick();
      timerRef.current = setInterval(runTick, 12000);
    } catch (e) {
      setError(String((e as Error).message ?? e));
    }
  };

  useEffect(() => () => stopLoop(), [stopLoop]);

  if (!started) {
    return (
      <div className="w-full max-w-md mx-auto rounded-xl border border-emerald-900/80 bg-slate-950 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-emerald-100">Paper portfolio</h2>
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
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button
          type="button"
          onClick={handleStart}
          className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3"
        >
          Start portfolio
        </button>
        <p className="text-xs text-slate-500">
          Runs on AAPL &amp; TSLA only. Backend must be on port 3000 (Vite proxies{" "}
          <code className="text-slate-400">/paper-sim</code>).
        </p>
      </div>
    );
  }

  const p = tickData?.portfolio;
  const prices = tickData?.prices;

  return (
    <div className="w-full max-w-lg mx-auto space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold text-emerald-100">Live paper sim</h2>
        <button
          type="button"
          onClick={() => {
            stopLoop();
            setStarted(false);
            setTickData(null);
          }}
          className="text-xs text-slate-400 underline"
        >
          Reset
        </button>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

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
        <p className="text-slate-200">
          AAPL <strong>${prices?.AAPL?.toFixed(2) ?? "—"}</strong>
        </p>
        <p className="text-slate-200">
          TSLA <strong>${prices?.TSLA?.toFixed(2) ?? "—"}</strong>
        </p>
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
