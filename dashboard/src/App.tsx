import { useCallback, useEffect, useState } from "react";
import { AiThinkingStrip } from "./components/AiThinkingStrip";
import { PaperSim } from "./PaperSim";

type DemoPattern = "manual" | "all" | "solo" | "random";
type AppView = "ai-demo" | "paper";

export default function App() {
  const [view, setView] = useState<AppView>("paper");
  const [openai, setOpenai] = useState(false);
  const [claude, setClaude] = useState(false);
  const [xai, setXai] = useState(false);
  const [demoPattern, setDemoPattern] = useState<DemoPattern>("manual");
  const [soloTick, setSoloTick] = useState(0);

  const cycleDemo = useCallback(() => {
    setDemoPattern((p) => {
      const order: DemoPattern[] = ["manual", "all", "solo", "random"];
      const i = order.indexOf(p);
      return order[(i + 1) % order.length];
    });
  }, []);

  useEffect(() => {
    if (demoPattern === "solo") setSoloTick(0);
  }, [demoPattern]);

  useEffect(() => {
    if (demoPattern === "manual") return;

    if (demoPattern === "all") {
      setOpenai(true);
      setClaude(true);
      setXai(true);
      return;
    }

    if (demoPattern === "solo") {
      const id = setInterval(() => setSoloTick((t) => t + 1), 900);
      return () => clearInterval(id);
    }

    if (demoPattern === "random") {
      const id = setInterval(() => {
        setOpenai(Math.random() > 0.45);
        setClaude(Math.random() > 0.45);
        setXai(Math.random() > 0.45);
      }, 550);
      return () => clearInterval(id);
    }
  }, [demoPattern]);

  useEffect(() => {
    if (demoPattern !== "solo") return;
    const phase = soloTick % 3;
    setOpenai(phase === 0);
    setClaude(phase === 1);
    setXai(phase === 2);
  }, [soloTick, demoPattern]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-start gap-6 p-6 pt-12">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setView("paper")}
          className={`rounded-lg px-4 py-2 text-sm font-medium ${
            view === "paper"
              ? "bg-emerald-700 text-white"
              : "bg-slate-800 text-slate-300"
          }`}
        >
          Paper sim
        </button>
        <button
          type="button"
          onClick={() => setView("ai-demo")}
          className={`rounded-lg px-4 py-2 text-sm font-medium ${
            view === "ai-demo"
              ? "bg-indigo-600 text-white"
              : "bg-slate-800 text-slate-300"
          }`}
        >
          AI strip demo
        </button>
      </div>

      {view === "paper" ? (
        <PaperSim />
      ) : (
        <>
          <AiThinkingStrip
            openaiActive={openai}
            claudeActive={claude}
            xaiActive={xai}
          />

          <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-4">
            <p className="text-slate-400 text-sm text-center">
              Demo mode cycles: <strong className="text-slate-200">manual</strong>{" "}
              → <strong className="text-slate-200">all firing</strong> →{" "}
              <strong className="text-slate-200">one at a time</strong> →{" "}
              <strong className="text-slate-200">random stagger</strong>
            </p>

            <button
              type="button"
              onClick={cycleDemo}
              className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 px-4 text-sm transition-colors"
            >
              Demo mode:{" "}
              <span className="uppercase tracking-wide">{demoPattern}</span> —
              tap to cycle
            </button>

            {demoPattern === "manual" && (
              <div className="flex flex-wrap gap-3 justify-center">
                <label className="flex items-center gap-2 text-slate-300 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={openai}
                    onChange={(e) => setOpenai(e.target.checked)}
                    className="rounded border-slate-600"
                  />
                  OpenAI
                </label>
                <label className="flex items-center gap-2 text-slate-300 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={claude}
                    onChange={(e) => setClaude(e.target.checked)}
                    className="rounded border-slate-600"
                  />
                  Claude
                </label>
                <label className="flex items-center gap-2 text-slate-300 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={xai}
                    onChange={(e) => setXai(e.target.checked)}
                    className="rounded border-slate-600"
                  />
                  xAI
                </label>
              </div>
            )}
          </div>

          <p className="text-slate-600 text-xs max-w-md text-center">
            Embed{" "}
            <code className="text-slate-400">&lt;AiThinkingStrip /&gt;</code> in
            your dashboard header. Run{" "}
            <code className="text-slate-400">npm install && npm run dev</code>{" "}
            from <code className="text-slate-400">dashboard/</code>.
          </p>
        </>
      )}
    </div>
  );
}
