import { motion } from "framer-motion";

export type VoteKind = "BUY" | "SELL" | "HOLD";

type BulbState = "busy" | VoteKind | "err" | "idle";

export const COUNCIL_MODELS = [
  { key: "claude", label: "Claude" },
  { key: "gpt", label: "GPT" },
  { key: "grok", label: "Grok" },
  { key: "ollama", label: "Ollama" },
  { key: "deo", label: "Gemini" },
] as const;

function voteColor(v: VoteKind): string {
  if (v === "BUY") return "#22c55e";
  if (v === "SELL") return "#ef4444";
  return "#eab308";
}

function Bulb({
  label,
  state,
  errHint,
}: {
  label: string;
  state: BulbState;
  /** Shown on hover when state is err */
  errHint?: string;
}) {
  const busy = state === "busy";
  const err = state === "err";
  const idle = state === "idle";
  const solid =
    state === "BUY" || state === "SELL" || state === "HOLD" ? state : null;

  const color = err
    ? "#94a3b8"
    : idle
      ? "#cbd5e1"
      : busy
        ? "#f59e0b"
        : solid
          ? voteColor(solid)
          : "#cbd5e1";

  return (
    <div className="flex flex-col items-center gap-1 min-w-[3.25rem]">
      <span className="text-[9px] uppercase tracking-wide font-semibold text-slate-500">
        {label}
      </span>
      <motion.span
        title={
          err && errHint
            ? errHint
            : err
              ? "No vote — model error or not configured"
              : undefined
        }
        className="rounded-full block cursor-default"
        style={{ width: 14, height: 14, backgroundColor: color }}
        animate={
          busy
            ? {
                opacity: [0.35, 1, 0.35],
                scale: [1, 1.15, 1],
                boxShadow: [
                  "0 0 0 transparent",
                  "0 0 12px rgba(245,158,11,0.85)",
                  "0 0 0 transparent",
                ],
              }
            : {
                opacity: solid || err ? 1 : 0.45,
                scale: 1,
                boxShadow:
                  solid && !busy
                    ? `0 0 10px ${voteColor(solid)}`
                    : "0 0 0 transparent",
              }
        }
        transition={{
          duration: busy ? 0.85 : 0.2,
          repeat: busy ? Infinity : 0,
        }}
      />
    </div>
  );
}

export type CouncilSlice = {
  votes?: Partial<Record<(typeof COUNCIL_MODELS)[number]["key"], VoteKind>>;
  errors?: Partial<Record<(typeof COUNCIL_MODELS)[number]["key"], string>>;
  consensus?: VoteKind | string | null;
  counts?: Record<string, number>;
  participated?: number;
  quorumMet?: boolean;
  tieBreak?: boolean;
  error?: string;
};

export function CouncilVoteLights({
  council,
  pollBusy,
}: {
  council?: CouncilSlice | null;
  pollBusy: boolean;
}) {
  if (council?.error) {
    return (
      <p className="text-sm text-rose-600 bg-rose-50 rounded-lg px-3 py-2">
        {council.error}
      </p>
    );
  }

  const votes = council?.votes ?? {};
  const errs = council?.errors ?? {};

  const ck = council?.consensus;
  const consensusKind: VoteKind | null =
    ck === "BUY" || ck === "SELL" || ck === "HOLD" ? ck : null;

  const participated = council?.participated;
  const quorumMet = council?.quorumMet !== false;
  const tieBreak = council?.tieBreak === true;

  const quorumNote =
    typeof participated === "number"
      ? `${participated} working ${participated === 1 ? "model" : "models"} in this blend`
      : null;

  return (
    <div className="flex flex-col gap-3">
      {pollBusy ? (
        <div className="text-center py-5 text-sm font-semibold text-amber-700 animate-pulse">
          Blending council…
        </div>
      ) : consensusKind ? (
        <div className="flex flex-col items-center gap-2 py-5 px-4 rounded-2xl bg-white border-2 border-slate-100 shadow-md">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
            Council outcome
          </span>
          <span
            className="text-3xl font-black tracking-tight px-6 py-2 rounded-xl text-white shadow-lg"
            style={{ backgroundColor: voteColor(consensusKind) }}
          >
            {consensusKind}
          </span>
          {!quorumMet ? (
            <p className="text-[11px] text-amber-800 text-center max-w-[17rem] leading-snug bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
              Standby rule: no valid votes this poll — committee outcome fixed at HOLD until models respond.
            </p>
          ) : null}
          {quorumMet && tieBreak ? (
            <p className="text-[11px] text-slate-600 text-center max-w-[17rem] leading-snug">
              Models disagreed; plurality tie resolved so the team still publishes exactly one direction (pure BUY vs SELL ties → HOLD).
            </p>
          ) : null}
          {quorumNote ? (
            <p className="text-[11px] text-slate-500 tabular-nums">{quorumNote}</p>
          ) : null}
          <p className="text-[11px] text-slate-500 text-center max-w-[16rem] leading-snug">
            One merged verdict every poll — valid replies only; failed or unclear models are excluded from the tally.
          </p>
        </div>
      ) : (
        <p className="text-center text-sm text-slate-500 py-3">
          No outcome yet — run the council.
        </p>
      )}

      {Object.keys(errs).length > 0 && !pollBusy && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/90 px-3 py-2 text-left">
          <p className="text-[10px] font-bold uppercase tracking-wide text-amber-900 mb-1">
            No vote from these models
          </p>
          <ul className="space-y-1 text-[11px] text-amber-950 leading-snug">
            {Object.entries(errs).map(([k, msg]) => (
              <li key={k}>
                <span className="font-semibold capitalize">{k}:</span>{" "}
                <span className="opacity-90">{msg}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <details className="rounded-xl border border-slate-200 bg-slate-50/90 overflow-hidden">
        <summary className="cursor-pointer px-4 py-3 text-xs font-semibold text-slate-600 hover:bg-slate-100/80 list-none flex items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
          <span>Individual model votes</span>
          <span className="text-[10px] font-normal text-slate-400">optional</span>
        </summary>
        <div className="px-3 pb-4 pt-0 flex flex-col gap-3 border-t border-slate-200/80">
          <div className="flex flex-wrap justify-center gap-4 py-3 px-2 rounded-xl bg-white/80 border border-white shadow-inner">
            {COUNCIL_MODELS.map(({ key, label }) => {
              let state: BulbState = "idle";
              if (pollBusy) state = "busy";
              else if (errs[key as keyof typeof errs]) state = "err";
              else if (votes[key as keyof typeof votes])
                state = votes[key as keyof typeof votes] as BulbState;
              return (
                <Bulb
                  key={key}
                  label={label}
                  state={state}
                  errHint={errs[key as keyof typeof errs]}
                />
              );
            })}
          </div>
          {council?.counts && !pollBusy ? (
            <p className="text-[11px] text-slate-600 tabular-nums text-center px-2">
              Tallies · BUY {council.counts.BUY ?? 0} · HOLD{" "}
              {council.counts.HOLD ?? 0} · SELL {council.counts.SELL ?? 0}
            </p>
          ) : null}
        </div>
      </details>
    </div>
  );
}
