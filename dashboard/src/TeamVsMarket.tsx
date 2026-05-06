import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CouncilTapeChart } from "./components/CouncilTapeChart";
import { type VoteKind } from "./components/CouncilVoteLights";
import { parseJsonResponse } from "./parseJsonResponse";

const API = "/stock-weather";

const COUNCIL_BOOT_SESSION_KEY = "mcpp_council_boot_v1";

type CardLite = {
  price?: number;
  rsi?: number;
  rsiLabel?: string;
  wave_state?: string;
  bbPercent?: number | null;
};

type CouncilLite = {
  votes?: Partial<Record<string, VoteKind>>;
  errors?: Record<string, string>;
  consensus?: VoteKind | string | null;
  counts?: Record<string, number>;
  participated?: number;
  quorumMet?: boolean;
  tieBreak?: boolean;
  error?: string;
  updatedAt?: number;
};

type AssetBundle = {
  meta: { ticker: string; feed: string; kind: string };
  card?: CardLite;
  council?: CouncilLite;
};

type DecisionEntry = {
  timestamp: number;
  asset: string;
  consensus: string | null;
  breakdown: Record<string, number>;
  votes: Record<string, string>;
  price?: number | null;
  participated?: number;
  quorumMet?: boolean;
  tieBreak?: boolean;
};

type SWState = {
  pollInProgress: boolean;
  lastPollAt: number | null;
  lastPollError?: string | null;
  pollIntervalMs: number;
  assets: AssetBundle[];
  decisionLog?: DecisionEntry[];
};

const VOTE_GREEN = "#16a34a";
const VOTE_AMBER = "#ca8a04";
const VOTE_ROSE = "#e11d48";
const LINE_PALETTE = ["#22d3ee", "#a78bfa", "#fbbf24", "#34d399", "#f472b6"];

function voteToScore(c: string | undefined): number | null {
  const u = String(c ?? "").toUpperCase();
  if (u === "BUY") return 1;
  if (u === "SELL") return -1;
  if (u === "HOLD") return 0;
  return null;
}

function decisionConsensusScore(c: string | null | undefined): number | null {
  return voteToScore(c ?? undefined);
}

function consensusHistoryForTicker(
  decisionLog: DecisionEntry[] | undefined,
  ticker: string,
  maxPoints = 18,
) {
  if (!decisionLog?.length) return [];
  const rows = decisionLog
    .filter(
      (e) =>
        e.asset === ticker &&
        decisionConsensusScore(e.consensus) != null,
    )
    .slice(0, maxPoints);
  const chronological = [...rows].reverse();
  return chronological.map((e, i) => ({
    n: i + 1,
    score: decisionConsensusScore(e.consensus) ?? 0,
    consensus: e.consensus as string,
    t: e.timestamp,
  }));
}

function fmtMoney(n: number | undefined) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function voteBg(v: VoteKind): string {
  if (v === "BUY") return "bg-emerald-600 ring-emerald-500/40";
  if (v === "SELL") return "bg-rose-600 ring-rose-500/40";
  return "bg-amber-500 ring-amber-400/40";
}

function VoteBadge({
  v,
  compact,
}: {
  v: VoteKind | undefined;
  compact?: boolean;
}) {
  if (!v)
    return (
      <span className={compact ? "text-slate-600 text-[10px]" : "text-slate-500"}>
        —
      </span>
    );
  return (
    <span
      className={`inline-flex items-center justify-center rounded-md font-bold text-white shadow-sm ring-1 ring-inset ${voteBg(v)} ${compact ? "text-[9px] px-1 py-0.5 min-w-[2rem]" : "text-xs px-2 py-0.5"}`}
    >
      {v}
    </span>
  );
}

function consensusTapeGauge(c: string): number {
  const u = String(c).toUpperCase();
  if (u === "BUY") return 78;
  if (u === "SELL") return 22;
  return 50;
}

/** Narrative hints for comparing auto blends across the universe (prompt / threshold tuning). */
function crossAssetTuneHints(
  assets: AssetBundle[],
): string[] {
  const hints: string[] = [];
  const rows = assets.map(({ meta, card, council }) => {
    const co = council?.consensus;
    const quorumMet = council?.quorumMet !== false;
    const blend =
      co === "BUY" || co === "SELL" || co === "HOLD" ? co : null;
    return {
      ticker: meta.ticker,
      blend,
      rsiLabel: card?.rsiLabel ?? "",
      quorumMet,
    };
  });

  if (!rows.length) return hints;

  const standby = rows.filter((r) => !r.quorumMet).length;
  const withBlend = rows.filter((r) => r.blend);

  if (!withBlend.length) {
    hints.push(
      "No outcomes loaded yet — wait for the next scheduler poll or tap Run council now.",
    );
    return hints;
  }

  const buy = rows.filter((r) => r.blend === "BUY").length;
  const sell = rows.filter((r) => r.blend === "SELL").length;
  const hold = rows.filter((r) => r.blend === "HOLD").length;
  hints.push(
    `Latest committee outcome (universe): ${buy} BUY · ${hold} HOLD · ${sell} SELL` +
      (standby ? ` · ${standby} standby (no model votes → HOLD)` : "") +
      ". Compare dashed blends vs solid tapes above.",
  );

  const hotBuys = rows
    .filter((r) => r.blend === "BUY" && r.rsiLabel === "Hot")
    .map((r) => r.ticker);
  if (hotBuys.length) {
    hints.push(
      `BUY + hot RSI: ${hotBuys.join(", ")} — panel chases strength; check indexed chart for continuation vs exhaustion.`,
    );
  }

  const coolBuys = rows
    .filter((r) => r.blend === "BUY" && r.rsiLabel === "Cool")
    .map((r) => r.ticker);
  if (coolBuys.length) {
    hints.push(
      `BUY vs cooler RSI: ${coolBuys.join(", ")} — potential dip-buy posture; tune if you want more momentum confirmation.`,
    );
  }

  const coolSells = rows
    .filter((r) => r.blend === "SELL" && r.rsiLabel === "Cool")
    .map((r) => r.ticker);
  if (coolSells.length) {
    hints.push(
      `SELL vs softer RSI: ${coolSells.join(", ")} — defensive tilt off highs; compare to peers still HOLD/BUY.`,
    );
  }

  const votingRows = rows.filter((r) => r.quorumMet && r.blend);
  const unanimous =
    votingRows.length >= 2 &&
    votingRows.every((r) => r.blend === votingRows[0].blend);
  if (unanimous) {
    hints.push(
      `Same outcome wherever models voted (${votingRows[0].blend}) — if indexed tapes split, tighten asset-specific context (DELTA/headlines) so the team isn’t dragged in lockstep.`,
    );
  } else if (
    votingRows.length >= 3 &&
    new Set(votingRows.map((r) => r.blend)).size > 1
  ) {
    hints.push(
      "Models disagreed across symbols — good tuning sandbox: which tapes justified each direction?",
    );
  }

  return hints;
}

function alignmentHint(
  consensus: string | undefined,
  rsiLabel: string | undefined,
): string | null {
  if (!consensus || !rsiLabel) return null;
  const c = consensus.toUpperCase();
  if (c === "BUY" && rsiLabel === "Cool")
    return "Council bullish while RSI reads cooler tape.";
  if (c === "BUY" && rsiLabel === "Hot")
    return "Council aligns with hot RSI — chasing momentum.";
  if (c === "BUY" && rsiLabel === "Balanced")
    return "BUY bias vs balanced RSI.";
  if (c === "SELL" && rsiLabel === "Hot")
    return "Team leaning out as RSI stays hot.";
  if (c === "SELL" && rsiLabel === "Cool")
    return "SELL vote vs softer RSI — defensive tilt.";
  if (c === "HOLD" && rsiLabel === "Hot")
    return "Neutral stance despite hot RSI.";
  if (c === "HOLD" && rsiLabel === "Cool")
    return "Neutral with cooler RSI.";
  return null;
}

export function TeamVsMarket() {
  const [data, setData] = useState<SWState | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API}/state`);
      const j = await parseJsonResponse(res);
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
  const assets = data?.assets ?? [];
  const decisionLog = data?.decisionLog;

  /** First load with no council stamp yet: one-shot poll so auto blends exist for tuning. */
  useEffect(() => {
    if (typeof sessionStorage === "undefined" || !data) return;
    if (data.lastPollAt != null) return;
    if (pollBusy) return;
    const key = COUNCIL_BOOT_SESSION_KEY;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    void triggerPoll();
  }, [data, pollBusy, triggerPoll]);

  const tuningHints = useMemo(() => crossAssetTuneHints(assets), [assets]);

  const consensusSnapshot = useMemo(
    () =>
      assets.map(({ meta, council }) => {
        const cons = council?.consensus;
        const quorumMet = council?.quorumMet !== false;
        const raw =
          cons === null || cons === undefined
            ? ""
            : String(cons).toUpperCase();
        const vk: VoteKind | null =
          raw === "BUY" || raw === "SELL" || raw === "HOLD" ? raw : null;
        return {
          ticker: meta.ticker,
          blend: vk ? (voteToScore(vk) ?? 0) : 0,
          label: vk ?? "—",
          hasBlend: vk != null,
          standby: vk != null && !quorumMet,
        };
      }),
    [assets],
  );

  const rsiCouncilRows = useMemo(
    () =>
      assets
        .map(({ meta, card, council }) => {
          const co = council?.consensus;
          const quorumMet = council?.quorumMet !== false;
          const noVotes = !quorumMet;
          return {
            ticker: meta.ticker,
            rsi:
              typeof card?.rsi === "number" && Number.isFinite(card.rsi)
                ? Math.round(card.rsi * 10) / 10
                : null,
            rsiLabel: card?.rsiLabel ?? "",
            councilGauge: noVotes ? 50 : consensusTapeGauge(String(co ?? "HOLD")),
            consensusLabel: noVotes
              ? "HOLD (standby)"
              : String(co ?? "HOLD").toUpperCase(),
          };
        })
        .filter(
          (r): r is {
            ticker: string;
            rsi: number;
            rsiLabel: string;
            councilGauge: number;
            consensusLabel: string;
          } => r.rsi != null,
        ),
    [assets],
  );

  const hasHistory = (decisionLog?.length ?? 0) > 0;

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6 pb-16">
      <header className="text-center space-y-3 px-2">
        <h1 className="text-2xl md:text-3xl font-bold text-slate-100 tracking-tight">
          Team vs market
        </h1>
        <p className="text-sm text-slate-400 max-w-xl mx-auto leading-relaxed">
          Verdicts run automatically on the server (~
          {(data?.pollIntervalMs ?? 90000) / 1000}s); this tab loads them every ~8s.
          Compare blends across every symbol and tape shape to tune prompts,
          weights, and gates — chart defaults to all names indexed together.
        </p>
        <div className="flex flex-wrap justify-center gap-3 items-center">
          <button
            type="button"
            onClick={triggerPoll}
            disabled={pollBusy}
            className="rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-semibold px-5 py-2 text-sm shadow-lg shadow-cyan-900/30"
          >
            {pollBusy ? "Council running…" : "Run council now"}
          </button>
          {data?.lastPollAt != null && (
            <span className="text-xs text-slate-500">
              Last poll {new Date(data.lastPollAt).toLocaleTimeString()} · auto
              refresh ~8s · scheduler{" "}
              {(data.pollIntervalMs ?? 90000) / 1000}s
            </span>
          )}
        </div>
      </header>

      {data?.lastPollError ? (
        <p className="text-center text-xs text-amber-400/90 px-4">
          Last scheduler error: {data.lastPollError}
        </p>
      ) : null}

      {err && (
        <div className="rounded-xl bg-rose-950/60 border border-rose-800 text-rose-200 px-4 py-3 text-sm">
          {err}
        </div>
      )}

      {assets.length > 0 && tuningHints.length > 0 ? (
        <div className="mx-1 rounded-xl border border-emerald-900/45 bg-emerald-950/30 px-4 py-4 shadow-inner shadow-black/20">
          <h2 className="text-sm font-semibold text-emerald-200 mb-1.5">
            Auto verdict · cross-symbol tuning
          </h2>
          <p className="text-[11px] text-slate-500 mb-3 leading-relaxed max-w-3xl">
            The scheduler recomputes blends about every{" "}
            {(data?.pollIntervalMs ?? 90000) / 1000}s — no button required. Read the
            chart above as “tape vs blend” for every ticker at once, then use these
            notes to spot where tuning buys you sharper disagreement across names.
          </p>
          <ul className="space-y-2 text-[12px] text-slate-300 leading-relaxed list-disc pl-4 marker:text-emerald-400/90">
            {tuningHints.map((h, i) => (
              <li key={`hint-${i}`}>{h}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="px-1">
        <CouncilTapeChart
          decisionLog={data?.decisionLog}
          tickers={assets.map((a) => a.meta.ticker)}
        />
      </div>

      {/* Charts */}
      <section className="space-y-4 px-1">
        <div className="grid lg:grid-cols-5 gap-4">
          <div className="lg:col-span-3 rounded-xl border border-slate-800 bg-slate-900/80 p-4">
            <h2 className="text-sm font-semibold text-slate-200 mb-1">
              Council blend (latest poll)
            </h2>
            <p className="text-[11px] text-slate-500 mb-3">
              One bar per asset: the group&apos;s merged BUY / HOLD / SELL — not a
              split by model.
            </p>
            <div className="w-full h-[260px] min-h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={consensusSnapshot}
                  margin={{ top: 8, right: 12, left: 4, bottom: 4 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#334155"
                    horizontal={false}
                  />
                  <XAxis
                    type="number"
                    domain={[-1, 1]}
                    ticks={[-1, 0, 1]}
                    tick={{ fill: "#94a3b8", fontSize: 10 }}
                    axisLine={{ stroke: "#475569" }}
                    tickFormatter={(v) =>
                      v === 1 ? "BUY" : v === -1 ? "SELL" : "HOLD"
                    }
                  />
                  <YAxis
                    type="category"
                    dataKey="ticker"
                    width={44}
                    tick={{ fill: "#94a3b8", fontSize: 11 }}
                    axisLine={{ stroke: "#475569" }}
                  />
                  <ReferenceLine x={0} stroke="#64748b" strokeDasharray="4 4" />
                  <Tooltip
                    cursor={{ fill: "rgba(51,65,85,0.25)" }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const row = payload[0].payload as {
                        ticker?: string;
                        label?: string;
                        blend?: number;
                        hasBlend?: boolean;
                      };
                      return (
                        <div className="rounded-lg border border-slate-600 bg-slate-950/95 px-3 py-2 text-xs text-slate-200 shadow-xl">
                          <p className="font-semibold text-slate-300 mb-1">
                            {row.ticker}
                          </p>
                          {row.hasBlend ? (
                            <>
                              <p className="text-amber-200 font-bold">
                                Outcome: {row.label}
                                {row.standby ? (
                                  <span className="block text-[10px] font-normal text-slate-400 mt-1">
                                    Standby — no model votes; committee HOLD rule.
                                  </span>
                                ) : null}
                              </p>
                              <p className="text-slate-500 text-[10px] mt-0.5">
                                Mapped −1 (sell) · 0 (hold) · +1 (buy)
                              </p>
                            </>
                          ) : (
                            <p className="text-slate-400">
                              No outcome for this asset row.
                            </p>
                          )}
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="blend" barSize={18} minPointLength={8} radius={[0, 6, 6, 0]}>
                    {consensusSnapshot.map((e) => (
                      <Cell
                        key={e.ticker}
                        fill={
                          !e.hasBlend
                            ? "#475569"
                            : e.standby
                              ? "#64748b"
                              : e.blend > 0
                                ? VOTE_GREEN
                                : e.blend < 0
                                  ? VOTE_ROSE
                                  : VOTE_AMBER
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="lg:col-span-2 rounded-xl border border-slate-800 bg-slate-900/80 p-4">
            <h2 className="text-sm font-semibold text-slate-200 mb-1">
              Tape vs blend
            </h2>
            <p className="text-[11px] text-slate-500 mb-3">
              Cyan = RSI (real tape). Amber = blended council on a 0–100 tape
              (sell≈22 · hold≈50 · buy≈78). Gray bands = 30 / 70.
            </p>
            <div className="w-full h-[260px] min-h-[200px]">
              {rsiCouncilRows.length === 0 ? (
                <p className="text-sm text-slate-500 py-16 text-center">
                  No RSI values yet — wait for quotes.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={rsiCouncilRows}
                    margin={{ top: 4, right: 12, left: 4, bottom: 4 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#334155"
                      horizontal={false}
                    />
                    <XAxis
                      type="number"
                      domain={[0, 100]}
                      tick={{ fill: "#94a3b8", fontSize: 10 }}
                      axisLine={{ stroke: "#475569" }}
                    />
                    <YAxis
                      type="category"
                      dataKey="ticker"
                      width={44}
                      tick={{ fill: "#94a3b8", fontSize: 11 }}
                      axisLine={{ stroke: "#475569" }}
                    />
                    <ReferenceLine x={30} stroke="#475569" strokeDasharray="4 4" />
                    <ReferenceLine x={70} stroke="#475569" strokeDasharray="4 4" />
                    <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const row = payload[0].payload as {
                          ticker: string;
                          rsi: number;
                          rsiLabel: string;
                          councilGauge: number;
                          consensusLabel: string;
                        };
                        return (
                          <div className="rounded-lg border border-slate-600 bg-slate-950/95 px-3 py-2 text-xs text-slate-200 shadow-xl">
                            <p className="font-semibold text-slate-300">
                              {row.ticker}
                            </p>
                            <p className="text-sky-300">
                              RSI {row.rsi}
                              {row.rsiLabel ? ` · ${row.rsiLabel}` : ""}
                            </p>
                            <p className="text-amber-200 mt-1">
                              Council blend {row.consensusLabel}{" "}
                              <span className="text-slate-500">
                                (gauge {row.councilGauge}
                                {row.consensusLabel.startsWith("HOLD (standby)")
                                  ? " — no votes; committee HOLD"
                                  : ""}
                                )
                              </span>
                            </p>
                          </div>
                        );
                      }}
                    />
                    <Bar
                      dataKey="rsi"
                      name="RSI (tape)"
                      fill="#0ea5e9"
                      radius={[0, 6, 6, 0]}
                      opacity={0.92}
                    />
                    <Bar
                      dataKey="councilGauge"
                      name="Council blend"
                      fill="#fbbf24"
                      radius={[0, 6, 6, 0]}
                      opacity={0.9}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
          <h2 className="text-sm font-semibold text-slate-200 mb-1">
            Blended verdict trail
          </h2>
          <p className="text-[11px] text-slate-500 mb-3">
            Council conclusion only (oldest → newest per mini chart). BUY +1 ·
            HOLD 0 · SELL −1, stepped.
          </p>
          {!hasHistory ? (
            <p className="text-sm text-slate-500 py-8 text-center">
              No history yet — run the council a few times to chart how votes
              evolve.
            </p>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {assets.map(({ meta }, idx) => {
                const tk = meta.ticker;
                const series = consensusHistoryForTicker(decisionLog, tk);
                const color = LINE_PALETTE[idx % LINE_PALETTE.length];
                return (
                  <div
                    key={tk}
                    className="rounded-lg border border-slate-800/80 bg-slate-950/50 p-2"
                  >
                    <p className="text-[11px] font-bold text-slate-300 mb-1 px-1">
                      {tk}
                    </p>
                    <div className="h-[112px] w-full">
                      {series.length < 2 ? (
                        <p className="text-[10px] text-slate-600 px-1 pt-6 text-center">
                          Need 2+ polls for a line
                        </p>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart
                            data={series}
                            margin={{ top: 4, right: 4, left: -18, bottom: 0 }}
                          >
                            <CartesianGrid
                              strokeDasharray="3 3"
                              stroke="#1e293b"
                            />
                            <XAxis
                              dataKey="n"
                              tick={{ fill: "#64748b", fontSize: 9 }}
                              tickLine={false}
                            />
                            <YAxis
                              domain={[-1.15, 1.15]}
                              ticks={[-1, 0, 1]}
                              tick={{ fill: "#64748b", fontSize: 9 }}
                              width={22}
                            />
                            <ReferenceLine y={0} stroke="#475569" />
                            <Tooltip
                              content={({ active, payload }) => {
                                if (!active || !payload?.[0]) return null;
                                const row = payload[0].payload as {
                                  consensus?: string;
                                  n?: number;
                                  score?: number;
                                };
                                return (
                                  <div className="rounded border border-slate-600 bg-slate-950/95 px-2 py-1.5 text-[10px] text-slate-200 shadow-lg">
                                    #{row.n} ·{" "}
                                    <strong>{row.consensus}</strong> (
                                    {row.score})
                                  </div>
                                );
                              }}
                            />
                            <Line
                              type="stepAfter"
                              dataKey="score"
                              stroke={color}
                              strokeWidth={2}
                              dot={{ r: 3, fill: color }}
                              isAnimationActive={false}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Desktop table */}
      <div className="hidden md:block rounded-xl border border-slate-800 bg-slate-900/80 overflow-x-auto">
        <table className="w-full text-sm text-left border-collapse min-w-[720px]">
          <thead>
            <tr className="border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-500">
              <th className="px-4 py-3 font-semibold">Asset</th>
              <th className="px-3 py-3 font-semibold">Price</th>
              <th className="px-3 py-3 font-semibold">Tape</th>
              <th className="px-3 py-3 font-semibold">Council blend</th>
              <th className="px-3 py-3 font-semibold">Note</th>
            </tr>
          </thead>
          <tbody>
            {assets.map(({ meta, card, council }) => {
              const t = meta.ticker;
              const co = council?.consensus;
              const cons = co === null || co === undefined ? "" : String(co);
              const vk = cons.toUpperCase() as VoteKind;
              const consensusVote =
                vk === "BUY" || vk === "SELL" || vk === "HOLD" ? vk : undefined;
              const hint = alignmentHint(cons || undefined, card?.rsiLabel);

              return (
                <tr
                  key={t}
                  className="border-b border-slate-800/90 hover:bg-slate-800/40"
                >
                  <td className="px-4 py-3">
                    <div className="font-bold text-slate-100">{t}</div>
                    <div className="text-[11px] text-slate-500 capitalize mt-0.5">
                      {meta.kind === "crypto" ? "Crypto" : "Equity"} ·{" "}
                      <span className="font-mono text-slate-600">{meta.feed}</span>
                    </div>
                    {council?.error ? (
                      <p className="text-[11px] text-rose-400 mt-1">
                        {council.error}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-3 py-3 tabular-nums text-slate-200 font-semibold">
                    {fmtMoney(card?.price)}
                  </td>
                  <td className="px-3 py-3 text-slate-300">
                    <div className="text-xs">
                      RSI{" "}
                      <span className="text-slate-100 font-medium">
                        {card?.rsiLabel ?? "—"}
                      </span>
                      {typeof card?.rsi === "number" &&
                      Number.isFinite(card.rsi) ? (
                        <span className="text-slate-500 ml-1">
                          ({card.rsi.toFixed(1)})
                        </span>
                      ) : null}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1 max-w-[14rem] truncate">
                      Wave: {card?.wave_state ?? "—"}
                      {card?.bbPercent != null ? (
                        <span className="ml-2">
                          BB {card.bbPercent}%
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-col gap-1 items-start">
                      <VoteBadge v={consensusVote} />
                      {typeof council?.participated === "number" ? (
                        <span className="text-[10px] text-slate-500 tabular-nums">
                          {council.participated} valid{" "}
                          {council.participated === 1 ? "vote" : "votes"}
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-[11px] text-slate-400 leading-snug max-w-[220px]">
                    {hint ?? (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-4 px-1">
        {assets.map(({ meta, card, council }) => {
          const t = meta.ticker;
          const co = council?.consensus;
          const cons = co === null || co === undefined ? "" : String(co);
          const vk = cons.toUpperCase() as VoteKind;
          const consensusVote =
            vk === "BUY" || vk === "SELL" || vk === "HOLD" ? vk : undefined;
          const hint = alignmentHint(cons || undefined, card?.rsiLabel);

          return (
            <article
              key={t}
              className="rounded-xl border border-slate-800 bg-slate-900/90 p-4 space-y-3"
            >
              <div className="flex justify-between items-start gap-2">
                <div>
                  <h2 className="text-lg font-bold text-slate-100">{t}</h2>
                  <p className="text-[11px] text-slate-500 capitalize">
                    {meta.kind === "crypto" ? "Crypto" : "Equity"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold tabular-nums text-emerald-300">
                    {fmtMoney(card?.price)}
                  </p>
                  <div className="mt-1 flex flex-col items-end gap-1">
                    <VoteBadge v={consensusVote} />
                    {typeof council?.participated === "number" ? (
                      <span className="text-[10px] text-slate-500 tabular-nums">
                        {council.participated} valid{" "}
                        {council.participated === 1 ? "vote" : "votes"}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="text-xs text-slate-400 space-y-1 border-t border-slate-800 pt-2">
                <p>
                  RSI{" "}
                  <strong className="text-slate-200">
                    {card?.rsiLabel ?? "—"}
                  </strong>
                  {typeof card?.rsi === "number" &&
                  Number.isFinite(card.rsi)
                    ? ` (${card.rsi.toFixed(1)})`
                    : ""}
                </p>
                <p className="text-[11px] text-slate-500">
                  {card?.wave_state ?? "Wave —"}
                  {card?.bbPercent != null ? ` · BB ${card.bbPercent}%` : ""}
                </p>
              </div>

              {hint ? (
                <p className="text-[11px] text-slate-500 border-t border-slate-800 pt-2">
                  {hint}
                </p>
              ) : null}

              {council?.error ? (
                <p className="text-[11px] text-rose-400">{council.error}</p>
              ) : null}
            </article>
          );
        })}
      </div>

      <p className="text-center text-[11px] text-slate-600 px-4">
        Data from <code className="text-slate-500">GET /stock-weather/state</code>
        . Poll Stock Weather or tap Run council so votes stay fresh.
      </p>
    </div>
  );
}
