import { motion } from "framer-motion";

export type VoteKind = "BUY" | "SELL" | "HOLD";

type BulbState = "busy" | VoteKind | "err" | "idle";

const MODELS = [
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
  votes?: Partial<Record<(typeof MODELS)[number]["key"], VoteKind>>;
  errors?: Partial<Record<(typeof MODELS)[number]["key"], string>>;
  consensus?: VoteKind | string;
  counts?: Record<string, number>;
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

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap justify-center gap-4 py-2 px-3 rounded-2xl bg-white/70 border border-white/90 shadow-inner">
        {MODELS.map(({ key, label }) => {
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
      {council?.consensus && !pollBusy && (
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Consensus
          </span>
          <span
            className="text-sm font-bold px-3 py-1 rounded-full text-white shadow-sm"
            style={{
              backgroundColor: voteColor(String(council.consensus) as VoteKind),
            }}
          >
            {String(council.consensus)}
          </span>
          {council.counts && (
            <span className="text-xs text-slate-600 tabular-nums">
              {(
                (council.counts.BUY ?? 0) +
                (council.counts.HOLD ?? 0) +
                (council.counts.SELL ?? 0)
              )}
              /5 · BUY {council.counts.BUY ?? 0} · HOLD{" "}
              {council.counts.HOLD ?? 0} · SELL {council.counts.SELL ?? 0}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
