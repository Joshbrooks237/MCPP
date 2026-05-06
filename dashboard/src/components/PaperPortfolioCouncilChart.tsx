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

export type PaperHistRow = {
  ts: number;
  totalValue: number;
  score: number;
  consensus: string;
  evaluated: string;
};

export function PaperPortfolioCouncilChart({ rows }: { rows: PaperHistRow[] }) {
  const data = rows.map((r, i) => ({
    n: i + 1,
    label: new Date(r.ts).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
    totalValue: r.totalValue,
    score: r.score,
    consensus: r.consensus.toUpperCase(),
    evaluated: r.evaluated,
  }));

  if (data.length < 2) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
        <h3 className="text-sm font-semibold text-slate-200 mb-1">
          Portfolio vs council (session)
        </h3>
        <p className="text-[11px] text-slate-500 mb-3">
          Total account value (green) and blended council verdict each tick (yellow,
          BUY +1 / HOLD 0 / SELL −1). Hover shows which symbol was evaluated that
          tick.
        </p>
        <p className="text-sm text-slate-500 py-8 text-center">
          Chart appears after two ticks.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
      <h3 className="text-sm font-semibold text-slate-200 mb-1">
        Portfolio vs council (session)
      </h3>
        <p className="text-[11px] text-slate-500 mb-3">
          Total value (left) vs blended council stance each rotation (right).
          Symbols alternate by tick across your universe.
        </p>
      <div className="w-full h-[280px] min-h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 14, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis
              dataKey="label"
              tick={{ fill: "#64748b", fontSize: 9 }}
              interval="preserveStartEnd"
            />
            <YAxis
              yAxisId="usd"
              orientation="left"
              tick={{ fill: "#34d399", fontSize: 10 }}
              domain={["auto", "auto"]}
              tickFormatter={(v) =>
                typeof v === "number"
                  ? `$${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0)}`
                  : String(v)
              }
              width={52}
            />
            <YAxis
              yAxisId="vote"
              orientation="right"
              domain={[-1.15, 1.15]}
              ticks={[-1, 0, 1]}
              tick={{ fill: "#fbbf24", fontSize: 10 }}
              tickFormatter={(v) =>
                v === 1 ? "BUY" : v === -1 ? "SELL" : "HOLD"
              }
              width={40}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0].payload as {
                  label?: string;
                  totalValue?: number;
                  score?: number;
                  consensus?: string;
                  evaluated?: string;
                };
                return (
                  <div className="rounded-lg border border-slate-600 bg-slate-950/95 px-3 py-2 text-xs text-slate-200 shadow-xl">
                    <p className="font-semibold text-slate-300">{row.label}</p>
                    <p className="text-emerald-300">
                      Total: $
                      {typeof row.totalValue === "number"
                        ? row.totalValue.toFixed(2)
                        : "—"}
                    </p>
                    <p className="text-amber-200">
                      Council blend: {row.consensus} ({row.score}) · eval{" "}
                      <strong>{row.evaluated}</strong>
                    </p>
                  </div>
                );
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: 11, color: "#94a3b8", paddingTop: 8 }}
            />
            <Line
              yAxisId="usd"
              type="monotone"
              dataKey="totalValue"
              name="Total value"
              stroke="#34d399"
              strokeWidth={2}
              dot={{ r: 3, fill: "#34d399" }}
              isAnimationActive={false}
            />
            <Line
              yAxisId="vote"
              type="stepAfter"
              dataKey="score"
              name="Council blend"
              stroke="#fbbf24"
              strokeWidth={2}
              dot={{ r: 4, fill: "#fbbf24" }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
