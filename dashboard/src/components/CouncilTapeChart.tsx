import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { parseJsonResponse } from "../parseJsonResponse";

const API = "/stock-weather";

export type TapeDecisionRow = {
  timestamp: number;
  asset: string;
  consensus: string | null;
  price?: number | null;
};

function isRecordedBlend(c: unknown): c is string {
  const u = String(c ?? "").toUpperCase();
  return u === "BUY" || u === "SELL" || u === "HOLD";
}

type Candle = {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number | null;
};

type IntradayPayload = {
  ticker: string;
  feed: string;
  kind: string;
  interval: string;
  range: string;
  candles: Candle[];
};

type ChartMode = "detail" | "compare";

const TICKER_LINE_COLORS: Record<string, string> = {
  AAPL: "#22d3ee",
  TSLA: "#c084fc",
  BTC: "#fbbf24",
  ETH: "#fb7185",
};

const COUNCIL_LINE_SOLID = "#fbbf24";
/** Detail-mode Yahoo close line (left axis). */
const TAPE_CLOSE_LINE = "#67e8f9";

function consensusScoreNum(consensus: string): number | null {
  const u = String(consensus).toUpperCase();
  if (u === "BUY") return 1;
  if (u === "SELL") return -1;
  if (u === "HOLD") return 0;
  return null;
}

function councilBlendAtOrBefore(
  decisions: { t: number; consensus: string }[],
  t: number,
): number | null {
  let last: number | null = null;
  for (let i = 0; i < decisions.length; i++) {
    if (decisions[i].t > t) break;
    const s = consensusScoreNum(decisions[i].consensus);
    if (s !== null) last = s;
  }
  return last;
}

function labelConsensusScore(s: number | null | undefined): string {
  if (s === null || s === undefined) return "—";
  if (s >= 1) return "BUY";
  if (s <= -1) return "SELL";
  return "HOLD";
}

/** Piecewise-linear index level at wall-clock t (between Yahoo bar timestamps). */
function interpolateIndexed(
  series: { t: number; rel: number }[],
  t: number,
): number | null {
  if (!series.length) return null;
  if (t <= series[0].t) return series[0].rel;
  const last = series[series.length - 1];
  if (t >= last.t) return last.rel;
  let lo = 0;
  let hi = series.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const a = series[lo];
  const b = series[hi];
  if (b.t <= a.t) return a.rel;
  const w = (t - a.t) / (b.t - a.t);
  return a.rel + w * (b.rel - a.rel);
}

export function CouncilTapeChart({
  decisionLog,
  tickers,
}: {
  decisionLog: TapeDecisionRow[] | undefined;
  tickers: string[];
}) {
  /** Default to universe comparison so you can tune the panel against every tape at once. */
  const [mode, setMode] = useState<ChartMode>("compare");

  useEffect(() => {
    if (tickers.length <= 1) setMode("detail");
  }, [tickers.length]);
  const [selected, setSelected] = useState(tickers[0] ?? "");
  const [tape, setTape] = useState<IntradayPayload | null>(null);
  const [multiTape, setMultiTape] = useState<Record<string, Candle[]>>({});
  const [tapeErr, setTapeErr] = useState<string | null>(null);
  const [multiErr, setMultiErr] = useState<string | null>(null);
  const [tapeBusy, setTapeBusy] = useState(false);

  useEffect(() => {
    if (tickers.length && !tickers.includes(selected)) {
      setSelected(tickers[0]);
    }
  }, [tickers, selected]);

  const loadTape = useCallback(async (tk: string) => {
    if (!tk) return;
    setTapeBusy(true);
    setTapeErr(null);
    try {
      const res = await fetch(
        `${API}/intraday?ticker=${encodeURIComponent(tk)}`,
      );
      const j = (await parseJsonResponse(res)) as IntradayPayload & {
        error?: unknown;
      };
      if (!res.ok) {
        const msg =
          typeof j?.error === "object" && j?.error && "message" in j.error
            ? String((j.error as { message?: string }).message)
            : res.statusText;
        throw new Error(msg);
      }
      setTape(j);
    } catch (e) {
      setTape(null);
      setTapeErr(String((e as Error).message ?? e));
    } finally {
      setTapeBusy(false);
    }
  }, []);

  const loadAllTapes = useCallback(async () => {
    if (!tickers.length) return;
    setTapeBusy(true);
    setMultiErr(null);
    setTapeErr(null);
    try {
      const settled = await Promise.allSettled(
        tickers.map(async (tk) => {
          const res = await fetch(
            `${API}/intraday?ticker=${encodeURIComponent(tk)}`,
          );
          const j = (await parseJsonResponse(res)) as IntradayPayload & {
            error?: unknown;
          };
          if (!res.ok) {
            const msg =
              typeof j?.error === "object" && j?.error && "message" in j.error
                ? String((j.error as { message?: string }).message)
                : res.statusText;
            throw new Error(`${tk}: ${msg}`);
          }
          return { tk, candles: j.candles ?? [] };
        }),
      );

      const map: Record<string, Candle[]> = {};
      const errs: string[] = [];
      for (let i = 0; i < settled.length; i++) {
        const r = settled[i];
        const tk = tickers[i];
        if (r.status === "fulfilled") map[r.value.tk] = r.value.candles;
        else errs.push(`${tk}: ${String((r as PromiseRejectedResult).reason)}`);
      }
      setMultiTape(map);
      if (errs.length) setMultiErr(errs.slice(0, 3).join(" · "));
      else setMultiErr(null);
    } catch (e) {
      setMultiTape({});
      setMultiErr(String((e as Error).message ?? e));
    } finally {
      setTapeBusy(false);
    }
  }, [tickers]);

  useEffect(() => {
    if (mode === "detail") loadTape(selected);
  }, [mode, selected, loadTape]);

  useEffect(() => {
    if (mode === "compare") loadAllTapes();
  }, [mode, loadAllTapes]);

  const candles = tape?.candles ?? [];

  /** Consensus timeline for selected ticker (blended council outcome, not individual models). */
  const decisionsAscDetail = useMemo(() => {
    if (!candles.length || !decisionLog?.length) return [];
    const t0 = candles[0].t;
    const t1 = candles[candles.length - 1].t;
    return decisionLog
      .filter(
        (e) =>
          e.asset === selected &&
          e.timestamp >= t0 &&
          e.timestamp <= t1 &&
          isRecordedBlend(e.consensus),
      )
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((e) => ({
        t: e.timestamp,
        consensus: String(e.consensus).toUpperCase(),
      }));
  }, [candles, decisionLog, selected]);

  const detailChartRows = useMemo(() => {
    return candles.map((c) => ({
      ...c,
      councilScore: councilBlendAtOrBefore(decisionsAscDetail, c.t),
    }));
  }, [candles, decisionsAscDetail]);

  const loggedPricesForDomain = useMemo(() => {
    if (!candles.length || !decisionLog?.length) return [] as number[];
    const t0 = candles[0].t;
    const t1 = candles[candles.length - 1].t;
    return decisionLog
      .filter(
        (e) =>
          e.asset === selected &&
          e.timestamp >= t0 &&
          e.timestamp <= t1,
      )
      .map((e) => e.price)
      .filter((p): p is number => typeof p === "number" && Number.isFinite(p));
  }, [candles, decisionLog, selected]);

  const priceDomain = useMemo((): [number, number] | ["auto", "auto"] => {
    if (!candles.length) return ["auto", "auto"];
    let mn = Math.min(...candles.map((c) => c.l));
    let mx = Math.max(...candles.map((c) => c.h));
    for (const p of loggedPricesForDomain) {
      mn = Math.min(mn, p);
      mx = Math.max(mx, p);
    }
    const pad = (mx - mn) * 0.06 || Math.abs(mx || mn) * 0.002 || 0.01;
    return [mn - pad, mx + pad];
  }, [candles, loggedPricesForDomain]);

  const normByTicker = useMemo(() => {
    const out: Record<string, { t: number; rel: number }[]> = {};
    for (const tk of tickers) {
      const cds = multiTape[tk];
      if (!cds?.length) continue;
      const c0 = cds[0].c;
      if (!Number.isFinite(c0) || c0 === 0) continue;
      out[tk] = cds.map((x) => ({ t: x.t, rel: (x.c / c0) * 100 }));
    }
    return out;
  }, [multiTape, tickers]);

  const firstCloses = useMemo(() => {
    const fc: Record<string, number> = {};
    for (const tk of tickers) {
      const c = multiTape[tk]?.[0]?.c;
      if (typeof c === "number" && Number.isFinite(c) && c > 0) fc[tk] = c;
    }
    return fc;
  }, [multiTape, tickers]);

  const mergedIndexed = useMemo(() => {
    const ts = new Set<number>();
    for (const tk of tickers) {
      multiTape[tk]?.forEach((c) => ts.add(c.t));
    }
    const sorted = [...ts].sort((a, b) => a - b);
    return sorted.map((t) => {
      const row: Record<string, number | string | null> = {
        t,
        label: new Date(t).toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
      };
      for (const tk of tickers) {
        const series = normByTicker[tk];
        row[tk] = series ? interpolateIndexed(series, t) : null;
      }
      return row;
    });
  }, [multiTape, tickers, normByTicker]);

  const indexedDomain = useMemo((): [number, number] | ["auto", "auto"] => {
    let mn = Infinity;
    let mx = -Infinity;
    for (const row of mergedIndexed) {
      for (const tk of tickers) {
        const v = row[tk];
        if (typeof v === "number" && Number.isFinite(v)) {
          mn = Math.min(mn, v);
          mx = Math.max(mx, v);
        }
      }
    }
    if (!Number.isFinite(mn) || !Number.isFinite(mx)) return ["auto", "auto"];
    const pad = (mx - mn) * 0.08 || 0.5;
    return [mn - pad, mx + pad];
  }, [mergedIndexed, tickers]);

  const decisionsByTicker = useMemo(() => {
    const out: Record<string, { t: number; consensus: string }[]> = {};
    if (!mergedIndexed.length || !decisionLog?.length) return out;
    const t0 = mergedIndexed[0].t as number;
    const t1 = mergedIndexed[mergedIndexed.length - 1].t as number;
    for (const tk of tickers) {
      out[tk] = decisionLog
        .filter(
          (e) =>
            e.asset === tk &&
            e.timestamp >= t0 &&
            e.timestamp <= t1 &&
            isRecordedBlend(e.consensus),
        )
        .sort((a, b) => a.timestamp - b.timestamp)
        .map((e) => ({
          t: e.timestamp,
          consensus: String(e.consensus).toUpperCase(),
        }));
    }
    return out;
  }, [mergedIndexed, decisionLog, tickers]);

  const mergedWithCouncil = useMemo(() => {
    return mergedIndexed.map((row) => {
      const t = row.t as number;
      const extended: Record<string, unknown> = { ...row };
      for (const tk of tickers) {
        extended[`council_${tk}`] = councilBlendAtOrBefore(
          decisionsByTicker[tk] ?? [],
          t,
        );
      }
      return extended;
    });
  }, [mergedIndexed, tickers, decisionsByTicker]);

  if (!tickers.length) return null;

  const showDetailChart = mode === "detail" && candles.length >= 2 && !tapeBusy;
  const showCompareChart =
    mode === "compare" && mergedIndexed.length >= 2 && !tapeBusy;

  return (
    <div className="rounded-xl border border-slate-800 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3 mb-3">
        <div>
          <h2 className="text-sm font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-fuchsia-300 to-amber-300">
            Tape vs council blend
          </h2>
          <p className="text-[11px] text-slate-500 mt-1 max-w-xl leading-relaxed">
            {mode === "detail"
              ? `Yahoo closes (${tape?.interval ?? "—"} bars): cyan line = close price; dashed amber stepped line = blended council verdict through time (BUY / HOLD / SELL), not each model separately.`
              : "Indexed real tape (solid) vs dashed blend per symbol on one clock — scan divergence to tune prompts, weights, or RSI gates across names."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex rounded-lg border border-slate-700 p-0.5 bg-slate-900/80">
            <button
              type="button"
              onClick={() => setMode("detail")}
              className={`rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
                mode === "detail"
                  ? "bg-slate-700 text-white"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              One asset
            </button>
            <button
              type="button"
              onClick={() => setMode("compare")}
              className={`rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
                mode === "compare"
                  ? "bg-slate-700 text-white"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              All indexed
            </button>
          </div>
          {mode === "detail" ? (
            <div className="flex flex-wrap gap-1.5">
              {tickers.map((tk) => (
                <button
                  key={tk}
                  type="button"
                  onClick={() => setSelected(tk)}
                  className={`rounded-lg px-3 py-1 text-[11px] font-bold tracking-wide transition-all ${
                    selected === tk
                      ? "bg-gradient-to-r from-cyan-600 to-fuchsia-600 text-white shadow-lg shadow-fuchsia-900/40"
                      : "bg-slate-800/90 text-slate-400 hover:text-slate-200 border border-slate-700"
                  }`}
                >
                  {tk}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-2 text-[10px] font-semibold uppercase tracking-wide mb-2 border-b border-slate-800/80 pb-2">
        <span className="flex items-center gap-2 text-slate-400">
          <span
            className="inline-block w-8 border-t-[3px] border-[#67e8f9]"
            aria-hidden
          />
          Yahoo tape
        </span>
        <span className="flex items-center gap-2 text-amber-200">
          <span
            className="inline-block w-8 border-t-[3px] border-dashed border-amber-300"
            aria-hidden
          />
          Council blend
        </span>
        <span className="text-slate-600 normal-case font-normal tracking-normal lowercase">
          (stepped: sell −1 · hold 0 · buy +1)
        </span>
      </div>

      {(tapeErr || multiErr) && (
        <p className="text-sm text-rose-400 mb-2 px-1">{tapeErr ?? multiErr}</p>
      )}
      {tapeBusy && mode === "detail" && !candles.length && (
        <p className="text-sm text-slate-500 py-16 text-center animate-pulse">
          Loading tape…
        </p>
      )}
      {tapeBusy && mode === "compare" && !mergedIndexed.length && (
        <p className="text-sm text-slate-500 py-16 text-center animate-pulse">
          Loading all symbols…
        </p>
      )}

      {!tapeBusy &&
        mode === "detail" &&
        candles.length < 2 &&
        !tapeErr && (
          <p className="text-sm text-slate-500 py-12 text-center">
            Not enough bars from Yahoo for this symbol yet.
          </p>
        )}

      {!tapeBusy &&
        mode === "compare" &&
        mergedIndexed.length < 2 &&
        !multiErr && (
          <p className="text-sm text-slate-500 py-12 text-center">
            Not enough overlapping Yahoo timestamps to compare.
          </p>
        )}

      {showDetailChart && (
        <div className="w-full h-[340px] min-h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={detailChartRows}
              margin={{ top: 12, right: 36, left: -6, bottom: 8 }}
            >
              <CartesianGrid strokeDasharray="4 6" stroke="#334155" opacity={0.6} />
              <XAxis
                type="number"
                dataKey="t"
                domain={["dataMin", "dataMax"]}
                tickFormatter={(unix) =>
                  new Date(unix).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                }
                tick={{ fill: "#64748b", fontSize: 9 }}
                stroke="#475569"
              />
              <YAxis
                yAxisId="price"
                domain={priceDomain}
                tick={{ fill: "#94a3b8", fontSize: 10 }}
                stroke="#475569"
                tickFormatter={(v) =>
                  typeof v === "number"
                    ? v >= 1000
                      ? `${(v / 1000).toFixed(1)}k`
                      : v.toFixed(v >= 100 ? 1 : 2)
                    : String(v)
                }
                width={46}
              />
              <YAxis
                yAxisId="council"
                orientation="right"
                domain={[-1.15, 1.15]}
                ticks={[-1, 0, 1]}
                tick={{ fill: "#fcd34d", fontSize: 10 }}
                stroke="#78350f"
                tickFormatter={(v) =>
                  v === 1 ? "BUY" : v === -1 ? "SELL" : "HOLD"
                }
                width={44}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.[0]) return null;
                  const row = payload[0].payload as Candle & {
                    councilScore?: number | null;
                  };
                  return (
                    <div className="rounded-xl border border-slate-600 bg-slate-950/95 px-3 py-2 text-xs text-slate-200 shadow-2xl backdrop-blur-sm max-w-[240px]">
                      <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
                        Yahoo tape
                      </p>
                      <p className="font-semibold text-fuchsia-300">
                        {new Date(row.t).toLocaleString()}
                      </p>
                      <p>O {row.o?.toFixed?.(4)} · H {row.h?.toFixed?.(4)}</p>
                      <p>L {row.l?.toFixed?.(4)} · C {row.c?.toFixed?.(4)}</p>
                      <hr className="my-2 border-slate-700" />
                      <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
                        Council blend
                      </p>
                      <p className="text-amber-200 font-bold">
                        {labelConsensusScore(row.councilScore ?? null)}
                        <span className="text-slate-500 font-normal ml-2 tabular-nums">
                          ({row.councilScore ?? "—"})
                        </span>
                      </p>
                    </div>
                  );
                }}
              />
              <Line
                yAxisId="price"
                type="linear"
                dataKey="c"
                name="Yahoo tape"
                stroke={TAPE_CLOSE_LINE}
                strokeWidth={2.5}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
              <Line
                yAxisId="council"
                type="stepAfter"
                dataKey="councilScore"
                name="Council blend"
                stroke={COUNCIL_LINE_SOLID}
                strokeWidth={2.5}
                strokeDasharray="6 4"
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {showCompareChart && (
        <div className="w-full h-[340px] min-h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={mergedWithCouncil}
              margin={{ top: 12, right: 40, left: -6, bottom: 8 }}
            >
              <CartesianGrid strokeDasharray="4 6" stroke="#334155" opacity={0.6} />
              <XAxis
                type="number"
                dataKey="t"
                domain={["dataMin", "dataMax"]}
                tickFormatter={(unix) =>
                  new Date(unix).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                }
                tick={{ fill: "#64748b", fontSize: 9 }}
                stroke="#475569"
              />
              <YAxis
                yAxisId="tape"
                domain={indexedDomain}
                tick={{ fill: "#94a3b8", fontSize: 10 }}
                stroke="#475569"
                tickFormatter={(v) =>
                  typeof v === "number" ? `${v.toFixed(1)}` : String(v)
                }
                width={44}
              />
              <YAxis
                yAxisId="council"
                orientation="right"
                domain={[-1.15, 1.15]}
                ticks={[-1, 0, 1]}
                tick={{ fill: "#fcd34d", fontSize: 9 }}
                stroke="#78350f"
                tickFormatter={(v) =>
                  v === 1 ? "BUY" : v === -1 ? "SELL" : "HOLD"
                }
                width={40}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const row = payload[0].payload as Record<string, unknown>;
                  const t = row.t as number;
                  return (
                    <div className="rounded-xl border border-slate-600 bg-slate-950/95 px-3 py-2 text-xs text-slate-200 shadow-2xl backdrop-blur-sm max-w-[260px]">
                      <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
                        Indexed tape
                      </p>
                      <p className="font-semibold text-fuchsia-300 mb-1">
                        {new Date(t).toLocaleString()}
                      </p>
                      {tickers.map((tk) => {
                        const v = row[tk];
                        if (typeof v !== "number" || !Number.isFinite(v))
                          return null;
                        const raw =
                          typeof firstCloses[tk] === "number"
                            ? (v / 100) * firstCloses[tk]
                            : null;
                        const ck = `council_${tk}`;
                        const cs = row[ck];
                        const blend =
                          typeof cs === "number" && Number.isFinite(cs)
                            ? labelConsensusScore(cs)
                            : "—";
                        return (
                          <p key={tk} style={{ color: TICKER_LINE_COLORS[tk] ?? "#cbd5e1" }}>
                            <strong>{tk}</strong> index {v.toFixed(2)}
                            {raw != null
                              ? ` (~$${raw.toLocaleString(undefined, { maximumFractionDigits: 2 })})`
                              : ""}
                            <span className="text-slate-500">
                              {" "}
                              · blend <strong className="text-amber-200/90">{blend}</strong>
                            </span>
                          </p>
                        );
                      })}
                    </div>
                  );
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: 11, color: "#94a3b8", paddingTop: 6 }}
              />
              {tickers.map((tk) => (
                <Line
                  key={tk}
                  yAxisId="tape"
                  type="linear"
                  dataKey={tk}
                  name={tk}
                  stroke={TICKER_LINE_COLORS[tk] ?? "#94a3b8"}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              ))}
              {tickers.map((tk) => (
                <Line
                  key={`council-${tk}`}
                  yAxisId="council"
                  type="stepAfter"
                  dataKey={`council_${tk}`}
                  name={`${tk} blend`}
                  stroke={TICKER_LINE_COLORS[tk] ?? "#94a3b8"}
                  strokeWidth={1.8}
                  strokeDasharray="6 4"
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {mode === "detail" &&
        !decisionsAscDetail.length &&
        candles.length >= 2 &&
        !tapeBusy &&
        !tapeErr && (
        <p className="text-[11px] text-slate-600 mt-2 text-center">
          No blended council history in this window yet — run polls so consensus appears on the yellow line.
        </p>
      )}
    </div>
  );
}
