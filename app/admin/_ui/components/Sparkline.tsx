"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

interface SparklineProps {
  data: Array<{ date: string; value: number }>;
  height?: number;
  color?: string;
  className?: string;
}

export function Sparkline({
  data,
  height = 48,
  color = "#64748b",
  className,
}: SparklineProps) {
  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-lg bg-slate-50 text-slate-400"
        style={{ height }}
      >
        No data
      </div>
    );
  }

  return (
    <div className={className} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <defs>
            <linearGradient id="sparkline-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="date" hide />
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Tooltip
            contentStyle={{
              fontSize: "12px",
              padding: "6px 10px",
              borderRadius: "8px",
            }}
            formatter={(value) => [Number(value ?? 0), ""]}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.5}
            fill="url(#sparkline-gradient)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
