import { motion } from "framer-motion";

const OPENAI = "#10a37f";
const CLAUDE = "#d97706";
const XAI = "#3b82f6";
const OLLAMA = "#14b8a6";
const DEO = "#a855f7";

export type AiThinkingStripProps = {
  openaiActive: boolean;
  claudeActive: boolean;
  xaiActive: boolean;
  /** Local / fifth council voter rows — default off for legacy demos. */
  ollamaActive?: boolean;
  /** Fifth seat (Gemini when GEMINI_API_KEY set, else OpenAI-compat Deo). */
  deoActive?: boolean;
  /** Number of dots per row (clamped 6–8). Default 7. */
  dotCount?: number;
  className?: string;
};

type RowProps = {
  label: string;
  color: string;
  active: boolean;
  dotCount: number;
};

function DotRow({ label, color, active, dotCount }: RowProps) {
  return (
    <div className="flex flex-col items-center gap-1 min-w-[5.5rem]">
      <span className="text-[10px] leading-none uppercase tracking-[0.12em] font-semibold text-slate-500">
        {label}
      </span>
      <div className="flex items-center gap-1">
        {Array.from({ length: dotCount }).map((_, i) => (
          <motion.span
            key={i}
            className="rounded-full shrink-0"
            style={{
              width: 10,
              height: 10,
              backgroundColor: color,
            }}
            animate={
              active
                ? {
                    opacity: [0.2, 1, 0.2],
                    scale: [1, 1.22, 1],
                    boxShadow: [
                      "0 0 0px transparent",
                      `0 0 14px ${color}`,
                      "0 0 0px transparent",
                    ],
                  }
                : {
                    opacity: 0.2,
                    scale: 1,
                    boxShadow: "0 0 0px transparent",
                  }
            }
            transition={{
              duration: 0.95,
              repeat: active ? Infinity : 0,
              ease: "easeInOut",
              delay: active ? i * 0.1 : 0,
            }}
          />
        ))}
      </div>
    </div>
  );
}

export function AiThinkingStrip({
  openaiActive,
  claudeActive,
  xaiActive,
  ollamaActive = false,
  deoActive = false,
  dotCount = 7,
  className = "",
}: AiThinkingStripProps) {
  const n = Math.min(8, Math.max(6, dotCount));

  return (
    <div
      className={`flex flex-wrap items-end justify-center gap-6 px-4 py-2 rounded-xl border border-slate-700/80 bg-slate-900/95 shadow-lg backdrop-blur-sm ${className}`}
      role="status"
      aria-live="polite"
      aria-label="AI model activity"
    >
      <DotRow label="OpenAI" color={OPENAI} active={openaiActive} dotCount={n} />
      <DotRow label="Claude" color={CLAUDE} active={claudeActive} dotCount={n} />
      <DotRow label="xAI / Grok" color={XAI} active={xaiActive} dotCount={n} />
      <DotRow label="Ollama" color={OLLAMA} active={ollamaActive} dotCount={n} />
      <DotRow label="Gemini" color={DEO} active={deoActive} dotCount={n} />
    </div>
  );
}
