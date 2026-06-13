"use client";

import { Bar, BarChart, XAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatYuan } from "@/lib/format";

const chartConfig = {
  revenue: { label: "收入", color: "var(--primary)" },
} satisfies ChartConfig;

export function DailyChart({
  daily,
}: {
  daily: { date: string; cents: number }[];
}) {
  const totalCents = daily.reduce((s, d) => s + d.cents, 0);
  const avgCents = Math.round(totalCents / (daily.length || 1));
  const maxCents = Math.max(...daily.map((d) => d.cents));

  return (
    <>
      <ChartContainer config={chartConfig} className="h-44 w-full mt-3">
        <BarChart data={daily}>
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            fontSize={10}
            tickMargin={4}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(v) => formatYuan(Number(v))}
                labelFormatter={(label) => `${label} 收入`}
              />
            }
          />
          <Bar
            dataKey="cents"
            fill="var(--color-revenue)"
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ChartContainer>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground border-t pt-2">
        <span>
          本周合计{" "}
          <span className="font-mono font-semibold text-foreground">
            {formatYuan(totalCents)}
          </span>
        </span>
        <span>
          日均{" "}
          <span className="font-mono font-semibold text-foreground">
            {formatYuan(avgCents)}
          </span>
        </span>
        <span>
          最高{" "}
          <span className="font-mono font-semibold text-foreground">
            {formatYuan(maxCents)}
          </span>
        </span>
      </div>
    </>
  );
}
