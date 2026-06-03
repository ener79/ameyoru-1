import Link from "next/link";
import { Trophy, Gift, ChevronLeft, ChevronRight } from "lucide-react";
import { requireSession } from "@/lib/auth-helpers";
import { leaderboard } from "@/server/stats";
import { giftLeaderboard } from "@/server/actions/gifts";
import { rangeLabel, type RangeKey } from "@/lib/date-range";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LeaderboardPodium } from "./podium";
import { LeaderboardRow as Row } from "./row";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { avatarInitial, formatYuan } from "@/lib/format";
import { cn } from "@/lib/utils";

const ranges: RangeKey[] = ["today", "week", "month"];
const giftRanges = ["today", "week", "month", "all"] as const;
const giftRangeLabel: Record<(typeof giftRanges)[number], string> = {
  today: "今日",
  week: "本周",
  month: "本月",
  all: "全部",
};
const PAGE_SIZE = 20;

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    range?: string;
    page?: string;
    type?: string;
    view?: string;
  }>;
}) {
  const { user: me } = await requireSession();
  const sp = await searchParams;

  const type = sp.type === "gifts" ? "gifts" : "orders";

  return (
    <>
      <PageHeader
        title="排行榜"
        description={
          type === "gifts"
            ? me.role === "BOSS" || me.role === "STAFF"
              ? "礼物打赏排行,展示打赏人和陪玩收入关系"
              : "礼物打赏排行,只能看见自己的具体收益"
            : me.role === "BOSS" || me.role === "STAFF"
            ? "按总时长排序,显示每位陪玩的接单情况"
            : "按总时长排序,只能看见自己的具体收益"
        }
      />

      {/* 类型切换 */}
      <div className="mb-4 inline-flex h-9 items-center justify-center rounded-lg bg-muted p-[3px]">
        <Link
          href="/leaderboard"
          scroll={false}
          className={cn(
            "inline-flex h-full items-center rounded-md px-4 text-sm font-medium gap-1.5 transition-all",
            type === "orders"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Trophy className="size-4" /> 接单排行
        </Link>
        <Link
          href="/leaderboard?type=gifts"
          scroll={false}
          className={cn(
            "inline-flex h-full items-center rounded-md px-4 text-sm font-medium gap-1.5 transition-all",
            type === "gifts"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Gift className="size-4" /> 礼物打赏
        </Link>
      </div>

      {type === "gifts" ? (
        <GiftsBoard sp={sp} myId={me.id} isBoss={me.role === "BOSS" || me.role === "STAFF"} />
      ) : (
        <OrdersBoard sp={sp} myId={me.id} isBoss={me.role === "BOSS" || me.role === "STAFF"} />
      )}
    </>
  );
}

/* ============================ 接单排行(原逻辑) ============================ */

async function OrdersBoard({
  sp,
  myId,
  isBoss,
}: {
  sp: { range?: string; page?: string };
  myId: string;
  isBoss: boolean;
}) {
  const range = (ranges.includes(sp.range as RangeKey) ? sp.range : "week") as RangeKey;
  const rows = await leaderboard(range);
  const safeRows = isBoss
    ? rows
    : rows.map((r) => ({
        ...r,
        payableCents: 0,
        commissionCents: 0,
        playerEarnCents: r.playerId === myId ? r.playerEarnCents : null,
      }));

  const restRows = safeRows.slice(3);
  const totalPages = Math.max(1, Math.ceil(restRows.length / PAGE_SIZE));
  const currentPage = Math.min(totalPages, Math.max(1, parseInt(sp.page ?? "1", 10) || 1));
  const pageRows = restRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const myRankIdx = safeRows.findIndex((r) => r.playerId === myId);
  const myRankLabel =
    myRankIdx >= 0 ? `你排第 ${myRankIdx + 1},共 ${safeRows.length} 人` : null;

  function pageHref(p: number) {
    return `/leaderboard?range=${range}&page=${p}`;
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex h-9 items-center justify-center rounded-lg bg-muted p-[3px]">
          {ranges.map((r) => (
            <Link
              key={r}
              href={`/leaderboard?range=${r}`}
              scroll={false}
              className={cn(
                "inline-flex h-full items-center rounded-md px-4 text-sm font-medium transition-all",
                r === range
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {rangeLabel[r]}
            </Link>
          ))}
        </div>
        {myRankLabel && !isBoss && (
          <Badge variant="secondary" className="text-xs">
            {myRankLabel}
          </Badge>
        )}
      </div>

      {safeRows.length === 0 ? (
        <EmptyState
          icon={<Trophy />}
          title={`${rangeLabel[range]}还没有订单`}
          description="陪玩报单后,排行实时更新"
        />
      ) : (
        <>
          <LeaderboardPodium rows={safeRows.slice(0, 3)} isBoss={isBoss} myId={myId} />
          {restRows.length > 0 && (
            <Card className="mt-6 overflow-hidden p-0">
              <ul className="divide-y">
                {pageRows.map((r, i) => {
                  const rank = 3 + (currentPage - 1) * PAGE_SIZE + i + 1;
                  return (
                    <Row
                      key={r.playerId}
                      row={r}
                      rank={rank}
                      isBoss={isBoss}
                      isMe={r.playerId === myId}
                    />
                  );
                })}
              </ul>
            </Card>
          )}

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-1.5">
              {currentPage > 1 && (
                <Button asChild variant="ghost" size="icon">
                  <Link href={pageHref(currentPage - 1)} scroll={false}>
                    <ChevronLeft />
                  </Link>
                </Button>
              )}
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(
                  (p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 2
                )
                .reduce<(number | "...")[]>((acc, p, idx, arr) => {
                  if (idx > 0 && p - (arr[idx - 1] ?? 0) > 1) acc.push("...");
                  acc.push(p);
                  return acc;
                }, [])
                .map((item, idx) =>
                  item === "..." ? (
                    <span key={`dots-${idx}`} className="px-1 text-sm text-muted-foreground">
                      …
                    </span>
                  ) : (
                    <Button
                      key={item}
                      asChild={item !== currentPage}
                      variant={item === currentPage ? "default" : "ghost"}
                      size="icon"
                      className="size-8 text-sm"
                    >
                      {item === currentPage ? (
                        <span>{item}</span>
                      ) : (
                        <Link href={pageHref(item)} scroll={false}>
                          {item}
                        </Link>
                      )}
                    </Button>
                  )
                )}
              {currentPage < totalPages && (
                <Button asChild variant="ghost" size="icon">
                  <Link href={pageHref(currentPage + 1)} scroll={false}>
                    <ChevronRight />
                  </Link>
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}

/* ============================ 礼物打赏排行 ============================ */

async function GiftsBoard({
  sp,
  myId,
  isBoss,
}: {
  sp: { range?: string; view?: string };
  myId: string;
  isBoss: boolean;
}) {
  const range = (giftRanges.includes(sp.range as (typeof giftRanges)[number])
    ? sp.range
    : "all") as (typeof giftRanges)[number];
  const requestedView = (
    sp.view === "senders" || sp.view === "players" ? sp.view : "pairs"
  ) as "pairs" | "senders" | "players";
  const view = isBoss ? requestedView : "players";

  const { senders, players, pairs } = await giftLeaderboard(range);
  const isEmpty =
    (view === "pairs" && pairs.length === 0) ||
    (view === "senders" && senders.length === 0) ||
    (view === "players" && players.length === 0);

  function rangeHref(r: (typeof giftRanges)[number]) {
    return `/leaderboard?type=gifts&range=${r}&view=${view}`;
  }
  function viewHref(v: "pairs" | "senders" | "players") {
    return `/leaderboard?type=gifts&range=${range}&view=${v}`;
  }

  return (
    <>
      {/* 时间范围 */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="inline-flex h-9 items-center justify-center rounded-lg bg-muted p-[3px]">
          {giftRanges.map((r) => (
            <Link
              key={r}
              href={rangeHref(r)}
              scroll={false}
              className={cn(
                "inline-flex h-full items-center rounded-md px-4 text-sm font-medium transition-all",
                r === range
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {giftRangeLabel[r]}
            </Link>
          ))}
        </div>
      </div>

      {isBoss && (
        <div className="mb-6 inline-flex h-9 items-center justify-center rounded-lg bg-muted p-[3px]">
          {(
            [
              { key: "pairs", label: "谁打赏谁" },
              { key: "senders", label: "打赏大佬榜" },
              { key: "players", label: "受宠陪玩榜" },
            ] as const
          ).map((v) => (
            <Link
              key={v.key}
              href={viewHref(v.key)}
              scroll={false}
              className={cn(
                "inline-flex h-full items-center rounded-md px-4 text-sm font-medium transition-all",
                v.key === view
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {v.label}
            </Link>
          ))}
        </div>
      )}

      {isEmpty ? (
        <EmptyState
          icon={<Gift />}
          title={`${giftRangeLabel[range]}还没有已支付的礼物`}
          description="待管理员支付报单后,这里会出现排行"
        />
      ) : view === "pairs" ? (
        <PairList pairs={pairs} />
      ) : view === "senders" ? (
        <SenderList senders={senders} />
      ) : (
        <PlayerList players={players} isBoss={isBoss} myId={myId} />
      )}
    </>
  );
}

function rankBadge(rank: number) {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return null;
}

function PairList({
  pairs,
}: {
  pairs: {
    senderNickname: string;
    playerId: string;
    playerName: string;
    totalCents: number;
    giftCount: number;
  }[];
}) {
  return (
    <Card className="overflow-hidden p-0">
      <ul className="divide-y">
        {pairs.map((p, i) => {
          const rank = i + 1;
          const emoji = rankBadge(rank);
          return (
            <li
              key={`${p.senderNickname}::${p.playerId}`}
              className={cn(
                "flex items-center gap-3 px-4 py-3",
                rank <= 3 && "bg-gradient-to-r from-pink-50/50 to-transparent dark:from-pink-950/20"
              )}
            >
              <div className="w-8 text-center text-sm font-mono font-semibold text-muted-foreground">
                {emoji ?? rank}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5 text-sm">
                  <span className="font-semibold truncate max-w-[8rem]" title={p.senderNickname}>
                    {p.senderNickname}
                  </span>
                  <Gift className="size-3.5 text-pink-500 shrink-0" />
                  <span className="text-muted-foreground">→</span>
                  <Avatar className="size-6">
                    <AvatarFallback className="text-[10px]">
                      {avatarInitial(p.playerName)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="font-medium truncate">{p.playerName}</span>
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {p.giftCount} 次打赏
                </div>
              </div>
              <div className="shrink-0 text-right font-mono tabular-nums">
                <div className="font-semibold text-pink-600">
                  {formatYuan(p.totalCents)}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function SenderList({
  senders,
}: {
  senders: {
    senderNickname: string;
    totalCents: number;
    giftCount: number;
    quantitySum: number;
  }[];
}) {
  return (
    <Card className="overflow-hidden p-0">
      <ul className="divide-y">
        {senders.map((s, i) => {
          const rank = i + 1;
          const emoji = rankBadge(rank);
          return (
            <li
              key={s.senderNickname}
              className={cn(
                "flex items-center gap-3 px-4 py-3",
                rank <= 3 && "bg-gradient-to-r from-yellow-50/60 to-transparent dark:from-yellow-950/20"
              )}
            >
              <div className="w-8 text-center text-sm font-mono font-semibold text-muted-foreground">
                {emoji ?? rank}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold truncate" title={s.senderNickname}>
                  {s.senderNickname}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {s.giftCount} 次打赏 · 共 {s.quantitySum} 个礼物
                </div>
              </div>
              <div className="shrink-0 text-right font-mono tabular-nums">
                <div className="font-semibold text-pink-600">
                  {formatYuan(s.totalCents)}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function PlayerList({
  players,
  isBoss,
  myId,
}: {
  players: {
    playerId: string;
    playerName: string;
    totalCents: number | null;
    earnCents: number | null;
    giftCount: number;
  }[];
  isBoss: boolean;
  myId: string;
}) {
  return (
    <Card className="overflow-hidden p-0">
      <ul className="divide-y">
        {players.map((p, i) => {
          const rank = i + 1;
          const emoji = rankBadge(rank);
          const isMe = p.playerId === myId;
          return (
            <li
              key={p.playerId}
              className={cn(
                "flex items-center gap-3 px-4 py-3",
                rank <= 3 && "bg-gradient-to-r from-pink-50/60 to-transparent dark:from-pink-950/20"
              )}
            >
              <div className="w-8 text-center text-sm font-mono font-semibold text-muted-foreground">
                {emoji ?? rank}
              </div>
              <Avatar className="size-9">
                <AvatarFallback>{avatarInitial(p.playerName)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 font-semibold">
                  <span className="truncate">{p.playerName}</span>
                  {isMe && (
                    <Badge variant="outline" className="text-[10px]">
                      我
                    </Badge>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  收到 {p.giftCount} 笔打赏
                  {isBoss && p.earnCents != null && (
                    <>
                      {" · 到手 "}
                      <span className="font-mono">{formatYuan(p.earnCents)}</span>
                    </>
                  )}
                  {!isBoss && isMe && p.earnCents != null && (
                    <>
                      {" · 我的到手 "}
                      <span className="font-mono">{formatYuan(p.earnCents)}</span>
                    </>
                  )}
                </div>
              </div>
              {(isBoss || isMe) && (
                <div className="shrink-0 text-right font-mono tabular-nums">
                  <div className="font-semibold text-pink-600">
                    {formatYuan(isBoss ? p.totalCents ?? 0 : p.earnCents ?? 0)}
                  </div>
                  {!isBoss && <div className="text-[11px] text-muted-foreground">我的到手</div>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
