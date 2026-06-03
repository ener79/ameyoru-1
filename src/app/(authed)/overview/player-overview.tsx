import Link from "next/link";
import { ChevronRight, Inbox, Plus, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { KpiCard } from "@/components/kpi-card";
import { Section } from "@/components/section";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { OrderStatusGroup } from "@/components/order-status-badge";
import { RankBadge } from "@/components/rank-badge";
import { cn } from "@/lib/utils";
import { leaderboard, playerRank, playerSummary, recentOrders } from "@/server/stats";
import {
  avatarInitial,
  formatDuration,
  formatRelativeDateTime,
  formatYuan,
} from "@/lib/format";

export async function PlayerOverview({
  userId,
  userName,
}: {
  userId: string;
  userName: string;
}) {
  const [today, week, month, weekTop, recent] = await Promise.all([
    playerSummary(userId, "today"),
    playerSummary(userId, "week"),
    playerSummary(userId, "month"),
    leaderboard("week", 5),
    recentOrders({ playerId: userId, limit: 5 }),
  ]);

  // 排名改成"数有多少人比我强"的轻查询,不再拉全表
  const [weekRankNum, monthRankNum] = await Promise.all([
    playerRank(userId, "week", week.durationMin, week.payableCents),
    playerRank(userId, "month", month.durationMin, month.payableCents),
  ]);

  const formatRank = (
    rank: number | null,
    range: "week" | "month",
    durationMin: number,
    orderCount: number
  ) => {
    const label = range === "week" ? "本周" : "本月";
    if (rank != null) return `${label}第 ${rank} · ${formatDuration(durationMin)}`;
    if (orderCount === 0) return `${label}还没单`;
    return `${label}未上榜`;
  };
  const rankDescription = `${formatRank(weekRankNum, "week", week.durationMin, week.orderCount)}  ·  ${formatRank(monthRankNum, "month", month.durationMin, month.orderCount)}`;

  return (
    <>
      <PageHeader
        title={`你好,${userName}`}
        description={rankDescription}
        action={
          <Button asChild size="lg" variant="outline">
            <Link href="/orders/new">
              <Plus /> 报单
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard
          label="今日完成"
          value={today.orderCount}
          hint={`${formatYuan(today.playerEarnCents)} 应得`}
        />
        <KpiCard
          label="本周应得"
          value={formatYuan(week.playerEarnCents)}
          hint={`${week.orderCount} 单`}
          emphasis
        />
        <KpiCard
          label="本月应得"
          value={formatYuan(month.playerEarnCents)}
          hint={`${month.orderCount} 单`}
        />
        <KpiCard
          label="未结订单"
          value={week.pendingCount}
          hint={`待收 ${formatYuan(week.pendingEarnCents)}`}
        />
      </div>

      {today.inProgressCount > 0 && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/[0.03] px-4 py-2.5 text-sm">
          <span className="text-muted-foreground">你有</span>
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

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Section
          title="本周排行"
          action={
            <Button asChild variant="ghost" size="sm">
              <Link href="/leaderboard">
                完整排行 <ChevronRight className="size-4" />
              </Link>
            </Button>
          }
        >
          {weekTop.length === 0 ? (
            <EmptyState
              icon={<Trophy />}
              title="本周还没有排行"
              description="加油接单上榜"
            />
          ) : (
            <ol className="space-y-1.5 rounded-xl border bg-card p-2">
              {weekTop.map((r, i) => {
                const isMe = r.playerId === userId;
                return (
                  <li
                    key={r.playerId}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors",
                      isMe ? "bg-primary/5" : "hover:bg-accent"
                    )}
                  >
                    <RankBadge index={i} />
                    <Avatar className="size-8">
                      <AvatarFallback className="bg-primary/10 text-primary text-xs">
                        {avatarInitial(r.displayName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        {r.displayName}
                        {isMe && (
                          <Badge
                            variant="outline"
                            className="px-1.5 text-[10px]"
                          >
                            我
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatDuration(r.durationMin)} · {r.orderCount} 单
                      </div>
                    </div>
                  </li>
                );
              })}

              {/* 自己不在 TOP 5 时,在末尾追加一行高亮显示自己的位置 */}
              {weekRankNum != null && weekRankNum > 5 && (
                <li className="mt-1 flex items-center gap-3 rounded-lg border-t border-dashed bg-primary/5 px-3 py-2.5">
                  <RankBadge index={weekRankNum - 1} />
                  <Avatar className="size-8">
                    <AvatarFallback className="bg-primary/10 text-primary text-xs">
                      {avatarInitial(userName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      {userName}
                      <Badge
                        variant="outline"
                        className="px-1.5 text-[10px]"
                      >
                        我
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatDuration(week.durationMin)} · {week.orderCount} 单
                    </div>
                  </div>
                </li>
              )}
            </ol>
          )}
        </Section>

        <Section
          title="最近报单"
          action={
            <Button asChild variant="ghost" size="sm">
              <Link href="/orders">
                我的全部 <ChevronRight className="size-4" />
              </Link>
            </Button>
          }
        >
          {recent.length === 0 ? (
            <EmptyState
              icon={<Inbox />}
              title="还没有报单"
              description="第一单从这里开始"
              action={
                <Button asChild size="sm">
                  <Link href="/orders/new">
                    <Plus /> 报单
                  </Link>
                </Button>
              }
            />
          ) : (
            <ul className="space-y-1.5 rounded-xl border bg-card p-2">
              {recent.map((o) => (
                <li key={o.id}>
                  <Link
                    href={`/orders?id=${o.id}`}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-accent"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {o.customerName}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatRelativeDateTime(o.startAt)}
                      </div>
                    </div>
                    <div className="text-right font-mono text-sm tabular-nums text-success">
                      {formatYuan(o.playerEarnCents)}
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
    </>
  );
}
