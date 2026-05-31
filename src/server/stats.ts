import { and, eq, gte, lte, desc, count, sum, sql, or, like } from "drizzle-orm";
import { db } from "@/db";
import { order, user, customer } from "@/db/schema";
import { rangeOf, type RangeKey } from "@/lib/date-range";

/**
 * 业务口径:
 * - 业绩数字(流水/抽成/单数/排行榜)只统计 COMPLETED 订单
 * - 已取消(CANCELED)单不进流水/单数,但其 playerCompensationCents 计入"陪玩应得"
 * - 进行中(IN_PROGRESS)单独计数
 * - 未结订单 = settleStatus=UNSETTLED 的 COMPLETED + CANCELED 单
 *   * COMPLETED 取 playerEarnCents,CANCELED 取 playerCompensationCents
 */

async function pendingSum(playerId?: string) {
  const cond = playerId ? [eq(order.playerId, playerId)] : [];
  const [completed] = await db
    .select({
      count: count(),
      s: sum(order.playerEarnCents).mapWith(Number),
    })
    .from(order)
    .where(
      and(
        eq(order.orderStatus, "COMPLETED"),
        eq(order.settleStatus, "UNSETTLED"),
        ...cond
      )
    );

  const [canceled] = await db
    .select({
      count: count(),
      s: sum(order.playerCompensationCents).mapWith(Number),
    })
    .from(order)
    .where(
      and(
        eq(order.orderStatus, "CANCELED"),
        eq(order.settleStatus, "UNSETTLED"),
        ...cond
      )
    );

  return {
    count: (completed?.count ?? 0) + (canceled?.count ?? 0),
    cents: (completed?.s ?? 0) + (canceled?.s ?? 0),
  };
}

export async function playerSummary(playerId: string, range: RangeKey) {
  const { from, to } = rangeOf(range);

  const [completed] = await db
    .select({
      orderCount: count(),
      durationMin: sum(order.durationMin).mapWith(Number),
      payableCents: sum(order.payableCents).mapWith(Number),
      commissionCents: sum(order.commissionCents).mapWith(Number),
      playerEarnCents: sum(order.playerEarnCents).mapWith(Number),
    })
    .from(order)
    .where(
      and(
        eq(order.playerId, playerId),
        eq(order.orderStatus, "COMPLETED"),
        gte(order.startAt, from),
        lte(order.startAt, to)
      )
    );

  const [canceledCompensation] = await db
    .select({ s: sum(order.playerCompensationCents).mapWith(Number) })
    .from(order)
    .where(
      and(
        eq(order.playerId, playerId),
        eq(order.orderStatus, "CANCELED"),
        gte(order.startAt, from),
        lte(order.startAt, to)
      )
    );

  const [inProgress] = await db
    .select({ count: count() })
    .from(order)
    .where(
      and(eq(order.playerId, playerId), eq(order.orderStatus, "IN_PROGRESS"))
    );

  const pending = await pendingSum(playerId);

  return {
    range,
    orderCount: completed?.orderCount ?? 0,
    durationMin: completed?.durationMin ?? 0,
    payableCents: completed?.payableCents ?? 0,
    commissionCents: completed?.commissionCents ?? 0,
    playerEarnCents:
      (completed?.playerEarnCents ?? 0) + (canceledCompensation?.s ?? 0),
    inProgressCount: inProgress?.count ?? 0,
    pendingCount: pending.count,
    pendingEarnCents: pending.cents,
  };
}

export async function shopSummary(range: RangeKey) {
  const { from, to } = rangeOf(range);

  const [completed] = await db
    .select({
      orderCount: count(),
      originalCents: sum(order.originalCents).mapWith(Number),
      discountCents: sum(order.discountCents).mapWith(Number),
      payableCents: sum(order.payableCents).mapWith(Number),
      commissionCents: sum(order.commissionCents).mapWith(Number),
      playerEarnCents: sum(order.playerEarnCents).mapWith(Number),
    })
    .from(order)
    .where(
      and(
        eq(order.orderStatus, "COMPLETED"),
        gte(order.startAt, from),
        lte(order.startAt, to)
      )
    );

  const [canceledCompensation] = await db
    .select({ s: sum(order.playerCompensationCents).mapWith(Number) })
    .from(order)
    .where(
      and(
        eq(order.orderStatus, "CANCELED"),
        gte(order.startAt, from),
        lte(order.startAt, to)
      )
    );

  const [inProgress] = await db
    .select({ count: count() })
    .from(order)
    .where(eq(order.orderStatus, "IN_PROGRESS"));

  const pending = await pendingSum();

  const payable = completed?.payableCents ?? 0;
  const playerEarn =
    (completed?.playerEarnCents ?? 0) + (canceledCompensation?.s ?? 0);

  return {
    range,
    orderCount: completed?.orderCount ?? 0,
    originalCents: completed?.originalCents ?? 0,
    discountCents: completed?.discountCents ?? 0,
    payableCents: payable,
    commissionCents: completed?.commissionCents ?? 0,
    playerEarnCents: playerEarn,
    /** 店铺毛利:实付 − 陪玩应得(含取消补偿),取消单的补偿都是店里出 */
    shopProfitCents: payable - playerEarn,
    inProgressCount: inProgress?.count ?? 0,
    pendingCount: pending.count,
    pendingEarnCents: pending.cents,
  };
}

export interface LeaderboardRow {
  playerId: string;
  displayName: string;
  username: string;
  orderCount: number;
  durationMin: number;
  payableCents: number;
  commissionCents: number;
  playerEarnCents: number;
}

export async function leaderboard(range: RangeKey): Promise<LeaderboardRow[]> {
  const { from, to } = rangeOf(range);
  // 排行榜口径:严格按 COMPLETED 单算业绩,取消单不计排名
  const rows = await db
    .select({
      playerId: order.playerId,
      orderCount: count(),
      durationMin: sum(order.durationMin).mapWith(Number),
      payableCents: sum(order.payableCents).mapWith(Number),
      commissionCents: sum(order.commissionCents).mapWith(Number),
      playerEarnCents: sum(order.playerEarnCents).mapWith(Number),
      displayName: user.name,
      username: user.username,
    })
    .from(order)
    .innerJoin(user, eq(user.id, order.playerId))
    .where(
      and(
        eq(order.orderStatus, "COMPLETED"),
        gte(order.startAt, from),
        lte(order.startAt, to)
      )
    )
    .groupBy(order.playerId)
    // 主指标:总时长(一单 30 小时比 30 单 1 小时强)
    // 次级:流水高的优先
    // 三级:同时长同流水,完成得更早的靠前
    .orderBy(
      desc(sum(order.durationMin)),
      desc(sum(order.payableCents)),
      sql`max(${order.completedAt}) asc`
    );

  return rows.map((r) => ({
    playerId: r.playerId,
    displayName: r.displayName ?? r.username ?? "?",
    username: r.username ?? "",
    orderCount: r.orderCount,
    durationMin: r.durationMin ?? 0,
    payableCents: r.payableCents ?? 0,
    commissionCents: r.commissionCents ?? 0,
    playerEarnCents: r.playerEarnCents ?? 0,
  }));
}

export async function customerSummary(opts: { q?: string } = {}) {
  const { q } = opts;
  const completedPayable = sql<number>`coalesce(sum(case when ${order.orderStatus} = 'COMPLETED' then ${order.payableCents} else 0 end), 0)`;
  const rows = await db
    .select({
      customerId: customer.id,
      orderCount:
        sql<number>`count(case when ${order.orderStatus} = 'COMPLETED' then 1 end)`.mapWith(
          Number
        ),
      payableCents: completedPayable.mapWith(Number),
      durationMin:
        sql<number>`coalesce(sum(case when ${order.orderStatus} = 'COMPLETED' then ${order.durationMin} else 0 end), 0)`.mapWith(
          Number
        ),
      name: customer.name,
      memberNo: customer.memberNo,
      wechat: customer.wechat,
      note: customer.note,
      balanceCents: customer.balanceCents,
    })
    .from(customer)
    .leftJoin(order, eq(order.customerId, customer.id))
    .where(q ? or(like(customer.name, `%${q}%`), like(customer.memberNo, `%${q}%`), like(customer.wechat, `%${q}%`)) : undefined)
    .groupBy(customer.id)
    .orderBy(desc(completedPayable), desc(customer.createdAt));

  return rows.map((r) => ({
    customerId: r.customerId,
    name: r.name,
    memberNo: r.memberNo,
    wechat: r.wechat,
    note: r.note,
    orderCount: r.orderCount,
    payableCents: r.payableCents ?? 0,
    durationMin: r.durationMin ?? 0,
    balanceCents: r.balanceCents,
  }));
}

export async function recentOrders(opts: { playerId?: string; limit?: number }) {
  const where = opts.playerId ? eq(order.playerId, opts.playerId) : undefined;
  const rows = await db
    .select({
      id: order.id,
      startAt: order.startAt,
      durationMin: order.durationMin,
      payableCents: order.payableCents,
      commissionCents: order.commissionCents,
      playerEarnCents: order.playerEarnCents,
      playerCompensationCents: order.playerCompensationCents,
      orderStatus: order.orderStatus,
      settleStatus: order.settleStatus,
      playerName: user.name,
      customerName: customer.name,
    })
    .from(order)
    .innerJoin(user, eq(user.id, order.playerId))
    .innerJoin(customer, eq(customer.id, order.customerId))
    .where(where)
    .orderBy(desc(order.startAt))
    .limit(opts.limit ?? 8);
  return rows;
}

export async function dailyRevenue(days: number): Promise<{ date: string; cents: number }[]> {
  const results: { date: string; cents: number }[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const from = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
    const to = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
    const [row] = await db
      .select({ s: sum(order.payableCents).mapWith(Number) })
      .from(order)
      .where(and(eq(order.orderStatus, "COMPLETED"), gte(order.startAt, from), lte(order.startAt, to)));
    results.push({
      date: `${d.getMonth() + 1}/${d.getDate()}`,
      cents: row?.s ?? 0,
    });
  }
  return results;
}

export async function weekOverWeekRevenue(): Promise<{ thisWeek: number; lastWeek: number }> {
  const now = new Date();
  const dayOfWeek = now.getDay() || 7;
  const thisMonday = new Date(now);
  thisMonday.setDate(now.getDate() - dayOfWeek + 1);
  thisMonday.setHours(0, 0, 0, 0);
  const lastMonday = new Date(thisMonday);
  lastMonday.setDate(thisMonday.getDate() - 7);
  const lastSunday = new Date(thisMonday);
  lastSunday.setMilliseconds(-1);

  const [thisW] = await db.select({ s: sum(order.payableCents).mapWith(Number) }).from(order)
    .where(and(eq(order.orderStatus, "COMPLETED"), gte(order.startAt, thisMonday)));
  const [lastW] = await db.select({ s: sum(order.payableCents).mapWith(Number) }).from(order)
    .where(and(eq(order.orderStatus, "COMPLETED"), gte(order.startAt, lastMonday), lte(order.startAt, lastSunday)));

  return { thisWeek: thisW?.s ?? 0, lastWeek: lastW?.s ?? 0 };
}
