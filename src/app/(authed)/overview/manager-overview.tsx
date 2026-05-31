import Link from "next/link";
import { ChevronRight, Inbox, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { KpiCard } from "@/components/kpi-card";
import { Section } from "@/components/section";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { OrderStatusGroup } from "@/components/order-status-badge";
import { RankBadge } from "@/components/rank-badge";
import { leaderboard, recentOrders, shopSummary, dailyRevenue, weekOverWeekRevenue } from "@/server/stats";
import {
  avatarInitial,
  formatRelativeDateTime,
  formatYuan,
} from "@/lib/format";

/** 给 BOSS / STAFF 共用的店铺总览 */
export async function ManagerOverview({ userName }: { userName: string }) {
  const [today, week, month, weekRank, recent, daily, wow] = await Promise.all([
    shopSummary("today"),
    shopSummary("week"),
    shopSummary("month"),
    leaderboard("week"),
    recentOrders({ limit: 6 }),
    dailyRevenue(7),
    weekOverWeekRevenue(),
  ]);

  const wowPct = wow.lastWeek > 0
    ? `${wow.thisWeek >= wow.lastWeek ? "↑" : "↓"} ${Math.abs(Math.round((wow.thisWeek - wow.lastWeek) / wow.lastWeek * 100))}%`
    : "";

  return (
    <>
      <PageHeader title={`你好,${userName}`} description="店铺总览" />

      {/* KPI 卡片 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard
          label="今日完成"
          value={today.orderCount}
          hint={`${formatYuan(today.payableCents)} 流水`}
        />
        <KpiCard
          label="本周流水"
          value={formatYuan(week.payableCents)}
          hint={`${week.orderCount} 单`}
          emphasis
        />
        <KpiCard label="本周抽成" value={formatYuan(week.commissionCents)} />
        <KpiCard
          label="未结订单"
          value={today.pendingCount}
          hint={`待付 ${formatYuan(today.pendingEarnCents)}`}
        />
      </div>

      {today.inProgressCount > 0 && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/[0.03] px-4 py-2.5 text-sm">
          <span className="text-muted-foreground">还有</span>
          <span className="font-mono font-semibold text-primary tabular-nums">
            {today.inProgressCount}
          </span>
          <span className="text-muted-foreground">单进行中</span>
          <Button asChild variant="ghost" size="sm" className="ml-auto">
            <Link href="/orders">
              查看 <ChevronRight className="size-4" />
            </Link>
          </Button>
        </div>
      )}

      {/* 近7日收入 — 全宽，柱形图+数字+平均线+汇总 */}
      <div className="mt-6">
        <Section title="近7日收入" description={wowPct ? `较上周 ${wowPct}` : "首周数据"}>
          {(() => {
            const max = Math.max(...daily.map(d => d.cents), 1);
            const totalCents = daily.reduce((s, d) => s + d.cents, 0);
            const avgCents = Math.round(totalCents / (daily.length || 1));
            const avgPct = max > 0 ? Math.round((avgCents / max) * 100) : 0;
            const weekdays = ["周日","周一","周二","周三","周四","周五","周六"];
            // figure out day-of-week for each date
            const now = new Date();

            return (
              <>
                <div className="relative flex items-end gap-2 h-36 mt-3">

                  {daily.map((d, i) => {
                    
                    const dayOffset = daily.length - 1 - i;
                    const dayDate = new Date(now);
                    dayDate.setDate(dayDate.getDate() - dayOffset);
                    const weekday = weekdays[dayDate.getDay()];
                    return (
                      <div key={d.date} className="flex flex-col items-center gap-1 flex-1">
                        <span className="text-[10px] font-mono tabular-nums text-foreground">
                          {d.cents > 0 ? formatYuan(d.cents) : "-"}
                        </span>
                        <div
                          className={"w-full rounded-t min-h-[4px] transition-all bg-primary"}
                          style={{ height: `${Math.max(4, Math.round((d.cents / max) * 110))}px` }}
                        />
                        <div className="text-center">
                          <div className="text-[9px] text-muted-foreground">{weekday}</div>
                          <div className="text-[10px] text-muted-foreground">{d.date}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground border-t pt-2">
                  <span>本周合计 <span className="font-mono font-semibold text-foreground">{formatYuan(totalCents)}</span></span>
                  <span>日均 <span className="font-mono font-semibold text-foreground">{formatYuan(avgCents)}</span></span>
                  <span>最高 <span className="font-mono font-semibold text-foreground">{formatYuan(Math.max(...daily.map(d => d.cents)))}</span></span>
                </div>
              </>
            );
          })()}
        </Section>
      </div>

      {/* 本周排行 + 最新报单 — 大屏左右，小屏上下 */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Section
          title="本周排行"
          description="按完成单量排序"
          action={
            <Button asChild variant="ghost" size="sm">
              <Link href="/leaderboard">
                完整排行 <ChevronRight className="size-4" />
              </Link>
            </Button>
          }
        >
          {weekRank.length === 0 ? (
            <EmptyState
              icon={<TrendingUp />}
              title="本周还没有完成订单"
              description="订单完成后,排行实时更新"
            />
          ) : (
            <ol className="space-y-1.5 rounded-xl border bg-card p-2">
              {weekRank.slice(0, 5).map((r, i) => (
                <li
                  key={r.playerId}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-accent"
                >
                  <RankBadge index={i} />
                  <Avatar className="size-8">
                    <AvatarFallback className="bg-primary/10 text-primary text-xs">
                      {avatarInitial(r.displayName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{r.displayName}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.orderCount} 单 · 流水 {formatYuan(r.payableCents)}
                    </div>
                  </div>
                  <div className="text-right font-mono text-sm tabular-nums text-muted-foreground">
                    {formatYuan(r.playerEarnCents)}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Section>

        <Section
          title="最新报单"
          action={
            <Button asChild variant="ghost" size="sm">
              <Link href="/orders">
                全部订单 <ChevronRight className="size-4" />
              </Link>
            </Button>
          }
        >
          {recent.length === 0 ? (
            <EmptyState
              icon={<Inbox />}
              title="还没有报单"
              description="陪玩可以从「报单」开始"
            />
          ) : (
            <ul className="space-y-1.5 rounded-xl border bg-card p-2">
              {recent.map((o) => (
                <li key={o.id}>
                  <Link
                    href={`/orders?id=${o.id}`}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-accent"
                  >
                    <Avatar className="size-8">
                      <AvatarFallback className="bg-muted text-foreground text-xs">
                        {avatarInitial(o.playerName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        <span>{o.playerName}</span>
                        <span className="text-muted-foreground">
                          {" "}· {o.customerName}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatRelativeDateTime(o.startAt)}
                      </div>
                    </div>
                    <div className="text-right font-mono text-sm tabular-nums">
                      {formatYuan(o.payableCents)}
                    </div>
                    <OrderStatusGroup
                      orderStatus={o.orderStatus}
                      settleStatus={o.settleStatus}
                      hasCompensation={o.playerCompensationCents > 0}
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      {/* 本月汇总 */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <KpiCard label="本月订单" value={month.orderCount} />
        <KpiCard label="本月流水" value={formatYuan(month.payableCents)} />
        <KpiCard label="本月抽成" value={formatYuan(month.commissionCents)} />
      </div>
    </>
  );
}
