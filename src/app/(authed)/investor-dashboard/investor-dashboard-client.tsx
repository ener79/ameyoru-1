"use client";

import { useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Download, RefreshCw, Search, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChartContainer } from "@/components/ui/chart";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input, InputWithIcon } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KpiCard } from "@/components/kpi-card";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import type { InvestorDashboardPayload } from "@/server/investor-dashboard";
import {
  investorRangeLabels,
  type InvestorRangePreset,
} from "@/lib/investor-dashboard-range";
import { cn } from "@/lib/utils";

type TableKey = keyof InvestorDashboardPayload["tables"];

const rangeOptions: InvestorRangePreset[] = [
  "today",
  "yesterday",
  "last7",
  "last15",
  "last30",
  "lastWeek",
  "lastMonth",
  "custom",
];

export function InvestorDashboardClient({
  payload,
}: {
  payload: InvestorDashboardPayload;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [activeTable, setActiveTable] = useState<TableKey>("orders");
  const [customFrom, setCustomFrom] = useState(toInputDate(payload.range.from));
  const [customTo, setCustomTo] = useState(toInputDate(payload.range.to));

  const filteredRows = useMemo(
    () => filterRows(payload.tables[activeTable], query),
    [activeTable, payload.tables, query]
  );
  const profitTrend = useMemo(
    () =>
      distributeCostsAcrossProfitTrend(
        payload.trends.profit,
        payload.financeInputs
      ),
    [payload.trends.profit, payload.financeInputs]
  );

  function updateRange(nextPreset: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("preset", nextPreset);
    if (nextPreset !== "custom") {
      params.delete("from");
      params.delete("to");
    } else {
      params.set("from", customFrom);
      params.set("to", customTo);
    }
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }

  function applyCustomRange() {
    const params = new URLSearchParams(searchParams.toString());
    params.set("preset", "custom");
    params.set("from", customFrom);
    params.set("to", customTo);
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }

  return (
    <>
      <PageHeader
        title="投资人数据看板"
        description={`当前周期：${payload.range.label}。重点看增长、复购、陪玩活跃和理论利润，资金项作为观察参考。`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">经营健康视角</Badge>
            <Select value={payload.range.preset} onValueChange={updateRange}>
              <SelectTrigger className="w-[132px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {rangeOptions.map((option) => (
                  <SelectItem key={option} value={option}>
                    {investorRangeLabels[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      {payload.range.preset === "custom" && (
        <div className="mb-5 flex flex-col gap-2 rounded-lg border bg-card p-3 sm:flex-row sm:items-center">
          <Input
            type="date"
            value={customFrom}
            onChange={(event) => setCustomFrom(event.target.value)}
          />
          <Input
            type="date"
            value={customTo}
            onChange={(event) => setCustomTo(event.target.value)}
          />
          <Button onClick={applyCustomRange} disabled={pending}>
            {pending ? <RefreshCw className="size-4 animate-spin" /> : null}
            应用
          </Button>
        </div>
      )}

      <OperatingHealthPanel
        payload={payload}
        cards={payload.cards}
        investor={payload.investor}
      />
      <RiskPanel risks={payload.risks} />
      <KpiGrid cards={payload.cards} />
      <TrendGrid payload={payload} profitTrend={profitTrend} />

      <Section
        className="mt-8"
        title="经营明细"
        description="支持搜索、分类查看和导出 CSV"
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportCsv(activeTable, filteredRows)}
          >
            <Download className="size-4" />
            导出 CSV
          </Button>
        }
      >
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <Tabs value={activeTable} onValueChange={(value) => setActiveTable(value as TableKey)}>
                <TabsList className="flex h-auto flex-wrap justify-start">
                  <TabsTrigger value="orders">订单流水</TabsTrigger>
                  <TabsTrigger value="gifts">礼物打赏</TabsTrigger>
                  <TabsTrigger value="balances">储值余额</TabsTrigger>
                  <TabsTrigger value="deposits">押金明细</TabsTrigger>
                </TabsList>
              </Tabs>
              <InputWithIcon
                icon={<Search />}
                className="lg:w-72"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索客户、陪玩、备注、状态"
              />
            </div>
            <DetailTable table={activeTable} rows={filteredRows} />
          </CardContent>
        </Card>
      </Section>
    </>
  );
}

function OperatingHealthPanel({
  payload,
  cards,
  investor,
}: {
  payload: InvestorDashboardPayload;
  cards: InvestorDashboardPayload["cards"];
  investor: InvestorDashboardPayload["investor"];
}) {
  const gmvGrowth = growthRate(
    payload.baseMetrics.recent7DayGmvCents,
    payload.baseMetrics.previous7DayGmvCents
  );
  const items = [
    {
      label: "近7日流水变化",
      value: gmvGrowth === null ? "暂无对比" : signedPercent(gmvGrowth),
      tone: gmvGrowth === null ? "neutral" : gmvGrowth >= 0 ? "good" : gmvGrowth <= -0.2 ? "bad" : "warn",
      hint: "判断业务是否正向增长",
    },
    {
      label: "复购健康度",
      value: percent(cards.repeatRate),
      tone: cards.repeatRate >= 0.3 ? "good" : "warn",
      hint: "低于30%说明客户沉淀不足",
    },
    {
      label: "陪玩活跃度",
      value: percent(cards.activePlayerRate),
      tone: cards.activePlayerRate >= 0.4 ? "good" : "warn",
      hint: "低于40%说明供给侧偏弱",
    },
    {
      label: "理论净利润",
      value: money(cards.netProfitCents),
      tone: cards.netProfitCents >= 0 ? "good" : "bad",
      hint: "平台收入减本周期成本",
    },
    {
      label: "预计回本周期",
      value: investor.estimatedPaybackDays ? `${investor.estimatedPaybackDays} 天` : "暂无",
      tone: investor.estimatedPaybackDays && investor.estimatedPaybackDays <= 180 ? "good" : "neutral",
      hint: "按近30日理论净利润估算",
    },
  ] as const;

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>经营健康</CardTitle>
        <CardDescription>先判断项目有没有增长、客户是否沉淀、供给是否活跃，再看资金观察。</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {items.map((item) => (
          <div key={item.label} className="rounded-lg border bg-background p-3">
            <div className="text-xs text-muted-foreground">{item.label}</div>
            <div
              className={cn(
                "mt-2 font-mono text-xl font-semibold tabular-nums",
                item.tone === "good" && "text-success",
                item.tone === "warn" && "text-warning-foreground",
                item.tone === "bad" && "text-destructive"
              )}
            >
              {item.value}
            </div>
            <div className="mt-2 text-xs text-muted-foreground">{item.hint}</div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function RiskPanel({ risks }: { risks: InvestorDashboardPayload["risks"] }) {
  return (
    <div className="mb-6 grid gap-3 md:grid-cols-2">
      {risks.length === 0 ? (
        <div className="rounded-lg border border-success/25 bg-success/5 p-4 text-sm text-success">
          当前周期未触发核心风险预警。
        </div>
      ) : (
        risks.map((risk) => (
          <div
            key={risk.code}
            className={cn(
              "flex gap-3 rounded-lg border p-4",
              risk.level === "red"
                ? "border-destructive/30 bg-destructive/5 text-destructive"
                : "border-warning/40 bg-warning/10 text-warning-foreground"
            )}
          >
            <ShieldAlert className="mt-0.5 size-4 shrink-0" />
            <div>
              <div className="font-medium">{risk.title}</div>
              <div className="mt-1 text-xs opacity-85">{risk.description}</div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function KpiGrid({ cards }: { cards: InvestorDashboardPayload["cards"] }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <KpiCard label="GMV 总流水" value={money(cards.gmvCents)} hint="订单 + 礼物" emphasis />
      <KpiCard label="平台抽成收入" value={money(cards.platformIncomeCents)} hint="订单抽成 + 礼物抽成" />
      <KpiCard label="净利润" value={money(cards.netProfitCents)} hint={`利润率 ${percent(cards.profitMargin)}`} className={cards.netProfitCents < 0 ? "border-destructive/40 bg-destructive/5" : ""} />
      <KpiCard label="付费客单价" value={money(cards.paidCustomerAverageCents)} hint="GMV / 付费客户数" />
      <KpiCard label="新增客户数" value={cards.newCustomerCount} hint="本周期新建客户" />
      <KpiCard label="活跃陪玩数" value={cards.activePlayerCount} hint={`活跃率 ${percent(cards.activePlayerRate)}`} />
      <KpiCard label="付费客户数" value={cards.paidCustomerCount} hint={`复购率 ${percent(cards.repeatRate)}`} />
      <KpiCard label="客户储值余额" value={money(cards.customerBalanceCents)} hint="含赠送余额" />
      <KpiCard label="陪玩押金余额" value={money(cards.playerDepositBalanceCents)} hint="当前按已缴押金统计" />
    </div>
  );
}

function TrendGrid({
  payload,
  profitTrend,
}: {
  payload: InvestorDashboardPayload;
  profitTrend: InvestorDashboardPayload["trends"]["profit"];
}) {
  return (
    <div className="mt-8 grid gap-6 xl:grid-cols-2">
      <ChartCard title="GMV 趋势" description="订单流水、礼物流水、总流水">
        <LineChart data={payload.trends.gmv}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" tickMargin={8} />
          <YAxis tickFormatter={axisMoney} width={54} />
          <Tooltip formatter={tooltipMoney} />
          <Line type="monotone" dataKey="orderCents" name="订单流水" stroke="#2563eb" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="giftCents" name="礼物流水" stroke="#16a34a" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="totalCents" name="总流水" stroke="#111827" strokeWidth={2} dot={false} />
        </LineChart>
      </ChartCard>
      <ChartCard title="平台收入趋势" description="按日展示平台抽成收入">
        <AreaChart data={payload.trends.income}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" tickMargin={8} />
          <YAxis tickFormatter={axisMoney} width={54} />
          <Tooltip formatter={tooltipMoney} />
          <Area type="monotone" dataKey="platformIncomeCents" name="平台收入" stroke="#0f766e" fill="#0f766e22" />
        </AreaChart>
      </ChartCard>
      <ChartCard title="净利润趋势" description="收入、成本、净利润">
        <BarChart data={profitTrend}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" tickMargin={8} />
          <YAxis tickFormatter={axisMoney} width={54} />
          <Tooltip formatter={tooltipMoney} />
          <Bar dataKey="incomeCents" name="收入" fill="#16a34a" />
          <Bar dataKey="costCents" name="成本" fill="#f59e0b" />
          <Line type="monotone" dataKey="netProfitCents" name="净利润" stroke="#dc2626" strokeWidth={2} />
        </BarChart>
      </ChartCard>
      <ChartCard title="客户增长趋势" description="新增客户、付费客户、复购客户">
        <LineChart data={payload.trends.customers}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" tickMargin={8} />
          <YAxis allowDecimals={false} width={36} />
          <Tooltip />
          <Line type="monotone" dataKey="newCustomers" name="新增客户" stroke="#2563eb" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="paidCustomers" name="付费客户" stroke="#16a34a" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="repeatCustomers" name="复购客户" stroke="#f59e0b" strokeWidth={2} dot={false} />
        </LineChart>
      </ChartCard>
      <ChartCard title="陪玩活跃趋势" description="总陪玩、活跃陪玩、活跃率">
        <LineChart data={payload.trends.players}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" tickMargin={8} />
          <YAxis allowDecimals={false} width={36} />
          <Tooltip formatter={(value, name) => name === "活跃率" ? percent(Number(value)) : value} />
          <Line type="monotone" dataKey="totalPlayers" name="总陪玩" stroke="#64748b" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="activePlayers" name="活跃陪玩" stroke="#2563eb" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="activeRate" name="活跃率" stroke="#16a34a" strokeWidth={2} dot={false} />
        </LineChart>
      </ChartCard>
    </div>
  );
}

function ChartCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactElement;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer
          config={{}}
          className="h-72 w-full aspect-auto"
          initialDimension={{ width: 640, height: 288 }}
        >
          {children}
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

function DetailTable({ table, rows }: { table: TableKey; rows: unknown[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        没有匹配的明细数据
      </div>
    );
  }

  const columns = columnsFor(table);
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[860px] text-sm">
        <thead className="bg-muted/70 text-xs text-muted-foreground">
          <tr>
            {columns.map((column) => (
              <th key={column.key} className="whitespace-nowrap px-3 py-2 text-left font-medium">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 100).map((row, index) => (
            <tr key={index} className="border-t">
              {columns.map((column) => (
                <td key={column.key} className="whitespace-nowrap px-3 py-2">
                  {formatCell((row as Record<string, unknown>)[column.key], column.kind)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 100 && (
        <div className="border-t px-3 py-2 text-xs text-muted-foreground">
          当前仅预览前 100 条，导出 CSV 会包含全部筛选结果。
        </div>
      )}
    </div>
  );
}

function columnsFor(table: TableKey) {
  const defs = {
    orders: [
      ["orderNo", "订单号"],
      ["date", "日期", "date"],
      ["customer", "客户"],
      ["player", "陪玩"],
      ["hours", "小时数"],
      ["unitPriceCents", "单价", "money"],
      ["amountCents", "订单金额", "money"],
      ["platformCommissionCents", "平台抽成", "money"],
      ["playerIncomeCents", "陪玩收入", "money"],
      ["status", "订单状态"],
    ],
    gifts: [
      ["date", "日期", "date"],
      ["customer", "客户"],
      ["player", "陪玩"],
      ["amountCents", "礼物金额", "money"],
      ["platformCommissionCents", "平台抽成", "money"],
      ["playerIncomeCents", "陪玩收入", "money"],
    ],
    balances: [
      ["customer", "客户"],
      ["rechargeCents", "充值金额", "money"],
      ["bonusCents", "赠送金额", "money"],
      ["consumedCents", "已消费金额", "money"],
      ["remainingCents", "剩余余额", "money"],
    ],
    deposits: [
      ["player", "陪玩"],
      ["amountCents", "押金金额", "money"],
      ["paidAt", "缴纳日期", "date"],
      ["status", "状态"],
      ["refunded", "是否已退", "boolean"],
    ],
  } satisfies Record<TableKey, Array<[string, string, string?]>>;

  return defs[table].map(([key, label, kind]) => ({ key, label, kind }));
}

function filterRows(rows: unknown[], query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((row) => JSON.stringify(row).toLowerCase().includes(q));
}

function exportCsv(table: TableKey, rows: unknown[]) {
  const columns = columnsFor(table);
  const csv = [
    columns.map((column) => csvCell(column.label)).join(","),
    ...rows.map((row) =>
      columns
        .map((column) => csvCell(formatCell((row as Record<string, unknown>)[column.key], column.kind)))
        .join(",")
    ),
  ].join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `investor-dashboard-${table}.csv`;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function formatCell(value: unknown, kind?: string): string {
  if (kind === "money") return money(Number(value ?? 0));
  if (kind === "date") return value ? new Date(String(value)).toLocaleString("zh-CN", { hour12: false }) : "-";
  if (kind === "boolean") return value ? "是" : "否";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(2);
  return value ? String(value) : "-";
}

function csvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function money(cents: number) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function percent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function signedPercent(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${percent(value)}`;
}

function growthRate(current: number, previous: number) {
  if (previous === 0) return null;
  return (current - previous) / previous;
}

function axisMoney(cents: number) {
  if (Math.abs(cents) >= 100_000) return `${Math.round(cents / 10_000) / 10}k`;
  return `${Math.round(cents / 100)}`;
}

function tooltipMoney(value: unknown) {
  return money(Number(value ?? 0));
}

function toInputDate(value: string) {
  return value.slice(0, 10);
}

function distributeCostsAcrossProfitTrend(
  rows: InvestorDashboardPayload["trends"]["profit"],
  values: InvestorDashboardPayload["financeInputs"]
) {
  const totalCost =
    values.operatingCostCents +
    values.promotionCostCents +
    values.fixedSalaryCents +
    values.otherExpenseCents;
  const perDayCost = rows.length ? Math.round(totalCost / rows.length) : 0;
  return rows.map((row, index) => {
    const costCents =
      index === rows.length - 1
        ? totalCost - perDayCost * Math.max(rows.length - 1, 0)
        : perDayCost;
    return {
      ...row,
      costCents,
      netProfitCents: row.incomeCents - costCents,
    };
  });
}
