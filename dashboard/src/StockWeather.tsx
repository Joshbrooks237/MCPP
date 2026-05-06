import { useCallback, useEffect, useState } from "react";
import { AiThinkingStrip } from "./components/AiThinkingStrip";
import { CouncilVoteLights, type VoteKind } from "./components/CouncilVoteLights";
import { parseJsonResponse } from "./parseJsonResponse";

const API = "/stock-weather";

const COUNCIL_BOOT_SESSION_KEY = "mcpp_council_boot_v1";

type Card = {
  ticker?: string;
  kind?: string;
  price?: number;
  rsi?: number;
  rsiLabel?: string;
  bollinger_position?: number;
  bbPercent?: number | null;
  wave_state?: string;
  error?: string;
};

type Council = {
  votes?: Record<string, VoteKind>;
  errors?: Record<string, string>;
  consensus?: VoteKind | string | null;
  counts?: Record<string, number>;
  participated?: number;
  quorumMet?: boolean;
  tieBreak?: boolean;
  error?: string;
};

type AssetBundle = {
  meta: { ticker: string; feed: string; kind: string };
  card?: Card;
  council?: Council;
};

type StudyEntry = {
  updatedAt: number;
  answers: Record<string, string>;
  errors?: Record<string, string>;
  summaryBars?: number;
};

type SWState = {
  pollInProgress: boolean;
  lastPollAt: number | null;
  pollIntervalMs: number;
  assets: AssetBundle[];
  decisionLog: Array<{
    timestamp: number;
    asset: string;
    consensus: string | null;
    breakdown: Record<string, number>;
    votes: Record<string, string>;
    price?: number | null;
    participated?: number;
    quorumMet?: boolean;
    tieBreak?: boolean;
  }>;
  paperPositions: Array<{
    id: string;
    ticker: string;
    side: string;
    usd: number;
    entryPrice: number;
    openedAt: number;
    unrealizedPnL?: number;
    consensus?: string;
  }>;
  studyCache: Record<string, StudyEntry>;
};

function fmtMoney(n: number | undefined) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function rsiPillClass(label: string) {
  if (label === "Cool") return "bg-sky-100 text-sky-800 border-sky-200";
  if (label === "Hot") return "bg-rose-100 text-rose-800 border-rose-200";
  if (label === "Balanced")
    return "bg-amber-50 text-amber-900 border-amber-200";
  return "bg-slate-100 text-slate-600 border-slate-200";
}

export function StockWeather() {
  const [data, setData] = useState<SWState | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [studyOpen, setStudyOpen] = useState<Record<string, boolean>>({});
  const [studyLoading, setStudyLoading] = useState<string | null>(null);
  const [tradeLoading, setTradeLoading] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API}/state`);
      const j = (await parseJsonResponse(res)) as {
        error?: unknown;
      };
      if (!res.ok) {
        const msg =
          typeof j?.error === "object" && j?.error?.message
            ? String(j.error.message)
            : typeof j?.error === "string"
              ? j.error
              : res.statusText;
        throw new Error(msg);
      }
      setData(j as SWState);
      setErr(null);
    } catch (e) {
      setErr(String((e as Error).message ?? e));
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, [load]);

  const triggerPoll = useCallback(async () => {
    setErr(null);
    try {
      const pollRes = await fetch(`${API}/poll`, { method: "POST" });
      const pj = (await parseJsonResponse(pollRes)) as {
        error?: unknown;
      };
      if (!pollRes.ok) {
        const msg =
          typeof pj?.error === "object" && pj?.error?.message
            ? String(pj.error.message)
            : typeof pj?.error === "string"
              ? pj.error
              : pollRes.statusText;
        throw new Error(msg);
      }
      await load();
    } catch (e) {
      setErr(String((e as Error).message ?? e));
    }
  }, [load]);

  const pollBusy = data?.pollInProgress ?? false;

  useEffect(() => {
    if (typeof sessionStorage === "undefined" || !data) return;
    if (data.lastPollAt != null) return;
    if (pollBusy) return;
    if (sessionStorage.getItem(COUNCIL_BOOT_SESSION_KEY)) return;
    sessionStorage.setItem(COUNCIL_BOOT_SESSION_KEY, "1");
    void triggerPoll();
  }, [data, pollBusy, triggerPoll]);

  const runStudy = async (ticker: string) => {
    setStudyLoading(ticker);
    setErr(null);
    try {
      const res = await fetch(`${API}/study`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker }),
      });
      const j = (await parseJsonResponse(res)) as {
        error?: unknown;
      };
      if (!res.ok) {
        const msg =
          typeof j?.error === "object" && j?.error?.message
            ? String(j.error.message)
            : typeof j?.error === "string"
              ? j.error
              : res.statusText;
        throw new Error(msg);
      }
      setStudyOpen((o) => ({ ...o, [ticker]: true }));
      await load();
    } catch (e) {
      setErr(String((e as Error).message ?? e));
    } finally {
      setStudyLoading(null);
    }
  };

  const paperTrade = async (ticker: string) => {
    setTradeLoading(ticker);
    setErr(null);
    try {
      const res = await fetch(`${API}/paper-trade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker, usd: 50 }),
      });
      const j = (await parseJsonResponse(res)) as {
        error?: unknown;
      };
      if (!res.ok) {
        const msg =
          typeof j?.error === "object" && j?.error?.message
            ? String(j.error.message)
            : typeof j?.error === "string"
              ? j.error
              : res.statusText;
        throw new Error(msg);
      }
      await load();
    } catch (e) {
      setErr(String((e as Error).message ?? e));
    } finally {
      setTradeLoading(null);
    }
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-sky-100 via-rose-50 to-amber-50 font-[Fredoka,system-ui,sans-serif] pb-16 px-4 pt-8">
      <header className="max-w-6xl mx-auto text-center mb-8">
        <h1 className="text-4xl md:text-5xl font-bold text-slate-800 tracking-tight">
          Stock Weather
        </h1>
        <p className="text-lg text-slate-600 mt-1 font-medium">
          + Crypto Council
        </p>
        <p className="text-sm text-slate-500 mt-2 max-w-xl mx-auto leading-snug">
          Blended BUY/HOLD/SELL refreshes on the server timer (~
          {(data?.pollIntervalMs ?? 90000) / 1000}s). Open{" "}
          <strong className="text-slate-600">Team vs market</strong> to compare every
          symbol&apos;s tape and verdict side by side for tuning.
        </p>
        <div className="flex flex-wrap justify-center gap-3 mt-4 items-center">
          <button
            type="button"
            onClick={triggerPoll}
            className="rounded-full bg-[#ff9f43] text-white font-semibold px-5 py-2 text-sm shadow-md hover:brightness-105 active:translate-y-px"
          >
            Run council now
          </button>
          {data?.lastPollAt != null && (
            <span className="text-xs text-slate-500">
              Last poll {new Date(data.lastPollAt).toLocaleTimeString()} · every{" "}
              {(data.pollIntervalMs ?? 90000) / 1000}s
            </span>
          )}
        </div>
      </header>

      {pollBusy && (
        <div className="max-w-xl mx-auto mb-6 flex justify-center">
          <AiThinkingStrip
            openaiActive={pollBusy}
            claudeActive={pollBusy}
            xaiActive={pollBusy}
            ollamaActive={pollBusy}
            deoActive={pollBusy}
          />
        </div>
      )}

      {err && (
        <div className="max-w-3xl mx-auto mb-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 text-sm">
          {err}
        </div>
      )}

      <section className="max-w-6xl mx-auto grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-10">
        {(data?.assets ?? []).map(({ meta, card }) => {
          const t = meta.ticker;
          const bb = card?.bbPercent ?? 0;
          return (
            <article
              key={t}
              className="rounded-[28px] bg-white border-4 border-white shadow-xl shadow-slate-200/80 p-5 flex flex-col gap-3"
            >
              <div className="flex justify-between items-start gap-2">
                <span className="text-2xl font-bold text-slate-800">{t}</span>
                <span
                  className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                    meta.kind === "crypto"
                      ? "bg-violet-50 text-violet-700 border-violet-200"
                      : "bg-sky-50 text-sky-700 border-sky-200"
                  }`}
                >
                  {meta.kind}
                </span>
              </div>

              <p className="text-3xl font-bold text-slate-900 tabular-nums">
                {fmtMoney(card?.price)}
              </p>

              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-slate-500 font-semibold uppercase">
                  RSI
                </span>
                <span
                  className={`text-xs font-bold px-2 py-0.5 rounded-full border ${rsiPillClass(card?.rsiLabel ?? "—")}`}
                >
                  {card?.rsiLabel ?? "—"} ({card?.rsi?.toFixed(1) ?? "—"})
                </span>
              </div>

              <div>
                <div className="flex justify-between text-xs text-slate-500 mb-1 font-medium">
                  <span>Bollinger position</span>
                  <span>{bb}% band</span>
                </div>
                <div className="h-3 rounded-full bg-slate-100 overflow-hidden border border-slate-200">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#74b9ff] via-[#ffeaa7] to-[#ff7675]"
                    style={{ width: `${Math.min(100, Math.max(0, bb))}%` }}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2 mt-auto pt-2">
                <button
                  type="button"
                  disabled={tradeLoading === t || pollBusy}
                  onClick={() => paperTrade(t)}
                  className="rounded-full bg-slate-800 text-white text-xs font-semibold py-2 hover:bg-slate-900 disabled:opacity-50"
                >
                  {tradeLoading === t ? "…" : "Place $50 paper trade"}
                </button>
                <button
                  type="button"
                  disabled={!!studyLoading || pollBusy}
                  onClick={() => runStudy(t)}
                  className="rounded-full bg-slate-100 text-slate-700 text-xs font-semibold py-2 border border-slate-200 hover:bg-slate-200 disabled:opacity-50"
                >
                  {studyLoading === t ? "Studying history…" : "Study history"}
                </button>
              </div>

              {studyOpen[t] && data?.studyCache?.[t] && (
                <details
                  open
                  className="mt-2 rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs"
                >
                  <summary className="cursor-pointer font-semibold text-slate-700">
                    What the council learned — {t}
                  </summary>
                  <div className="mt-2 space-y-2 max-h-48 overflow-y-auto">
                    {Object.entries(data.studyCache[t].answers).map(
                      ([k, text]) => (
                        <div key={k}>
                          <p className="font-bold text-slate-600 capitalize">
                            {k}
                          </p>
                          <p className="text-slate-600 whitespace-pre-wrap">
                            {text}
                          </p>
                        </div>
                      ),
                    )}
                    {data.studyCache[t].errors &&
                      Object.entries(data.studyCache[t].errors!).map(
                        ([k, msg]) => (
                          <p key={k} className="text-rose-600">
                            {k}: {msg}
                          </p>
                        ),
                      )}
                  </div>
                </details>
              )}
            </article>
          );
        })}
      </section>

      <section className="max-w-6xl mx-auto space-y-8">
        <h2 className="text-xl font-bold text-slate-800 text-center">
          Council blend panel
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {(data?.assets ?? []).map(({ meta, council }) => (
            <div
              key={meta.ticker}
              className="rounded-[28px] bg-white/95 border-4 border-white p-5 shadow-lg"
            >
              <h3 className="text-lg font-bold text-slate-800 mb-3">
                {meta.ticker}{" "}
                <span className="text-slate-400 font-normal text-sm">
                  council
                </span>
              </h3>
              <CouncilVoteLights council={council} pollBusy={pollBusy} />
            </div>
          ))}
        </div>

        <div className="rounded-[28px] bg-white border-4 border-white shadow-xl p-5">
          <h3 className="text-lg font-bold text-slate-800 mb-3">
            Decision log
          </h3>
          <ul className="space-y-2 max-h-72 overflow-y-auto text-sm">
            {(data?.decisionLog ?? []).map((row, i) => (
              <li
                key={`${row.timestamp}-${row.asset}-${i}`}
                className="flex flex-wrap gap-x-3 gap-y-1 border-b border-slate-100 pb-2"
              >
                <span className="text-slate-400 tabular-nums">
                  {new Date(row.timestamp).toLocaleString()}
                </span>
                <span className="font-bold text-slate-700">{row.asset}</span>
                <span
                  className={`font-bold ${
                    row.consensus === "BUY"
                      ? "text-green-600"
                      : row.consensus === "SELL"
                        ? "text-red-600"
                        : row.consensus === "HOLD"
                          ? "text-amber-600"
                          : "text-slate-400"
                  }`}
                >
                  {row.consensus ?? "—"}
                </span>
                {row.quorumMet === false ? (
                  <span className="text-[10px] font-semibold text-amber-700 uppercase tracking-wide">
                    standby
                  </span>
                ) : null}
                {row.tieBreak ? (
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                    tie resolved
                  </span>
                ) : null}
                <details className="inline">
                  <summary className="cursor-pointer text-slate-400 hover:text-slate-600 text-[11px] font-medium ml-1 select-none">
                    model split
                  </summary>
                  <span className="block text-slate-500 text-[11px] mt-1 pl-0">
                    {row.quorumMet === false ? (
                      <span className="block text-amber-800 mb-1">
                        No valid votes — outcome was HOLD by committee standby rule.
                      </span>
                    ) : null}
                    {row.tieBreak ? (
                      <span className="block text-slate-600 mb-1">
                        Models tied on counts — BUY vs SELL deadlock → HOLD; other ties use HOLD-first ordering.
                      </span>
                    ) : null}
                    {typeof row.participated === "number" ? (
                      <span className="block text-slate-600 mb-1">
                        Valid votes counted: {row.participated}
                      </span>
                    ) : null}
                    BUY {row.breakdown?.BUY ?? 0} · HOLD {row.breakdown?.HOLD ?? 0}{" "}
                    · SELL {row.breakdown?.SELL ?? 0}
                  </span>
                </details>
              </li>
            ))}
            {!data?.decisionLog?.length && (
              <li className="text-slate-500">No votes yet.</li>
            )}
          </ul>
        </div>

        <details className="rounded-[28px] bg-white border-4 border-white shadow-xl p-5">
          <summary className="text-lg font-bold text-slate-800 cursor-pointer">
            Paper positions &amp; unrealized P&amp;L
          </summary>
          <ul className="mt-3 space-y-2 text-sm">
            {(data?.paperPositions ?? []).map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap gap-3 border-b border-slate-100 pb-2"
              >
                <span className="font-bold">{p.ticker}</span>
                <span className="uppercase text-slate-500">{p.side}</span>
                <span>{fmtMoney(p.usd)}</span>
                <span>@ {fmtMoney(p.entryPrice)}</span>
                <span
                  className={
                    (p.unrealizedPnL ?? 0) >= 0
                      ? "text-green-600 font-semibold"
                      : "text-red-600 font-semibold"
                  }
                >
                  uPnL {fmtMoney(p.unrealizedPnL)}
                </span>
              </li>
            ))}
            {!data?.paperPositions?.length && (
              <li className="text-slate-500">No paper fills yet.</li>
            )}
          </ul>
        </details>
      </section>
    </div>
  );
}
