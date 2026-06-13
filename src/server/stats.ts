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
  // 把原来的 6 条查询(完成/取消补偿/进行中 + pendingSum 的 2 条)合并成单条 CASE WHEN 聚合。
  // 业绩口径(orderCount/duration/payable/commission/playerEarn)只算范围内 COMPLETED;
  // 取消补偿算范围内 CANCELED;进行中 / 待结算不带时间范围。
  const inRange = sql`${order.startAt} >= ${from} AND ${order.startAt} <= ${to}`;
  const [row] = await db
    .select({
      orderCount: sql<number>`count(case when ${order.orderStatus} = 'COMPLETED' and ${inRange} then 1 end)`.mapWith(Number),
      durationMin: sql<number>`coalesce(sum(case when ${order.orderStatus} = 'COMPLETED' and ${inRange} then ${order.durationMin} else 0 end), 0)`.mapWith(Number),
      payableCents: sql<number>`coalesce(sum(case when ${order.orderStatus} = 'COMPLETED' and ${inRange} then ${order.payableCents} else 0 end), 0)`.mapWith(Number),
      commissionCents: sql<number>`coalesce(sum(case when ${order.orderStatus} = 'COMPLETED' and ${inRange} then ${order.commissionCents} else 0 end), 0)`.mapWith(Number),
      completedEarnCents: sql<number>`coalesce(sum(case when ${order.orderStatus} = 'COMPLETED' and ${inRange} then ${order.playerEarnCents} else 0 end), 0)`.mapWith(Number),
      canceledCompensationCents: sql<number>`coalesce(sum(case when ${order.orderStatus} = 'CANCELED' and ${inRange} then ${order.playerCompensationCents} else 0 end), 0)`.mapWith(Number),
      inProgressCount: sql<number>`count(case when ${order.orderStatus} = 'IN_PROGRESS' then 1 end)`.mapWith(Number),
      pendingCount: sql<number>`count(case when ${order.settleStatus} = 'UNSETTLED' and (${order.orderStatus} = 'COMPLETED' or ${order.orderStatus} = 'CANCELED') then 1 end)`.mapWith(Number),
      pendingEarnCents: sql<number>`coalesce(sum(case when ${order.settleStatus} = 'UNSETTLED' and ${order.orderStatus} = 'COMPLETED' then ${order.playerEarnCents} when ${order.settleStatus} = 'UNSETTLED' and ${order.orderStatus} = 'CANCELED' then ${order.playerCompensationCents} else 0 end), 0)`.mapWith(Number),
    })
    .from(order)
    .where(eq(order.playerId, playerId));

  return {
    range,
    orderCount: row?.orderCount ?? 0,
    durationMin: row?.durationMin ?? 0,
    payableCents: row?.payableCents ?? 0,
    commissionCents: row?.commissionCents ?? 0,
    playerEarnCents:
      (row?.completedEarnCents ?? 0) + (row?.canceledCompensationCents ?? 0),
    inProgressCount: row?.inProgressCount ?? 0,
    pendingCount: row?.pendingCount ?? 0,
    pendingEarnCents: row?.pendingEarnCents ?? 0,
  };
}

/** 陪玩排名:数"业绩比我强的人数 + 1",避免拉全表排序。range 内严格按 COMPLETED 总时长,平时长再比流水。 */
export async function playerRank(
  playerId: string,
  range: RangeKey,
  myDurationMin: number,
  myPayableCents: number
): Promise<number | null> {
  if (myDurationMin <= 0) return null; // 范围内没完成单,不上榜
  const { from, to } = rangeOf(range);
  const perPlayer = db
    .select({
      pid: order.playerId,
      dur: sum(order.durationMin).mapWith(Number).as("dur"),
      pay: sum(order.payableCents).mapWith(Number).as("pay"),
    })
    .from(order)
    .where(
      and(
        eq(order.orderStatus, "COMPLETED"),
        gte(order.startAt, from),
        lte(order.startAt, to)
      )
    )
    .groupBy(order.playerId)
    .as("per_player");

  // 排在我前面 = 时长更长,或时长相同但流水更高
  const [{ ahead }] = await db
    .select({ ahead: count() })
    .from(perPlayer)
    .where(
      and(
        sql`${perPlayer.pid} <> ${playerId}`,
        or(
          sql`${perPlayer.dur} > ${myDurationMin}`,
          and(
            sql`${perPlayer.dur} = ${myDurationMin}`,
            sql`${perPlayer.pay} > ${myPayableCents}`
          )
        )
      )
    );
  return (ahead ?? 0) + 1;
}

/** 打款明细页汇总(全量,不受分页影响) */
export async function payoutSummary(playerId: string) {
  const payout = sql`case when ${order.orderStatus} = 'CANCELED' then ${order.playerCompensationCents} else ${order.playerEarnCents} end`;
  const isPayout = sql`(${order.orderStatus} = 'COMPLETED' or (${order.orderStatus} = 'CANCELED' and ${order.playerCompensationCents} > 0))`;
  const [row] = await db
    .select({
      unsettledCount: sql<number>`count(case when ${isPayout} and ${order.settleStatus} = 'UNSETTLED' then 1 end)`.mapWith(Number),
      settledCount: sql<number>`count(case when ${isPayout} and ${order.settleStatus} = 'SETTLED' then 1 end)`.mapWith(Number),
      unsettledEarnCents: sql<number>`coalesce(sum(case when ${isPayout} and ${order.settleStatus} = 'UNSETTLED' then ${payout} else 0 end), 0)`.mapWith(Number),
      settledEarnCents: sql<number>`coalesce(sum(case when ${isPayout} and ${order.settleStatus} = 'SETTLED' then ${payout} else 0 end), 0)`.mapWith(Number),
    })
    .from(order)
    .where(eq(order.playerId, playerId));
  return {
    unsettledCount: row?.unsettledCount ?? 0,
    settledCount: row?.settledCount ?? 0,
    unsettledEarnCents: row?.unsettledEarnCents ?? 0,
    settledEarnCents: row?.settledEarnCents ?? 0,
  };
}

export async function shopSummary(range: RangeKey) {
  const { from, to } = rangeOf(range);

  const [completed] = await db
    .select({
      orderCount: count(),
      durationMin: sum(order.durationMin).mapWith(Number),
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
    .select({
      count: count(),
      durationMin: sum(order.durationMin).mapWith(Number),
      payableCents: sum(order.payableCents).mapWith(Number),
    })
    .from(order)
    .where(eq(order.orderStatus, "IN_PROGRESS"));

  const pending = await pendingSum();

  const payable = completed?.payableCents ?? 0;
  const playerEarn =
    (completed?.playerEarnCents ?? 0) + (canceledCompensation?.s ?? 0);

  return {
    range,
    orderCount: completed?.orderCount ?? 0,
    durationMin: completed?.durationMin ?? 0,
    originalCents: completed?.originalCents ?? 0,
    discountCents: completed?.discountCents ?? 0,
    payableCents: payable,
    commissionCents: completed?.commissionCents ?? 0,
    playerEarnCents: playerEarn,
    /** 店铺毛利:实付 − 陪玩应得(含取消补偿),取消单的补偿都是店里出 */
    shopProfitCents: payable - playerEarn,
    inProgressCount: inProgress?.count ?? 0,
    inProgressDurationMin: inProgress?.durationMin ?? 0,
    inProgressPayableCents: inProgress?.payableCents ?? 0,
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

export async function leaderboard(range: RangeKey, limit?: number): Promise<LeaderboardRow[]> {
  const { from, to } = rangeOf(range);
  // 排行榜口径:严格按 COMPLETED 单算业绩,取消单不计排名
  const base = db
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

  const rows = limit ? await base.limit(limit) : await base;

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

export async function customerSummary(opts: { q?: string; limit?: number; offset?: number } = {}) {
  const { q, limit, offset } = opts;
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
    .where(customerSearchWhere(q))
    .groupBy(customer.id)
    .orderBy(desc(completedPayable), desc(customer.createdAt))
    .limit(limit ?? 1000)
    .offset(offset ?? 0);

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

function customerSearchWhere(q?: string) {
  return q
    ? or(
        like(customer.name, `%${q}%`),
        like(customer.memberNo, `%${q}%`),
        like(customer.wechat, `%${q}%`)
      )
    : undefined;
}

/** 客户页头部汇总(不受分页影响,按搜索条件统计全量) */
export async function customerTotals(opts: { q?: string } = {}) {
  const where = customerSearchWhere(opts.q);
  const [base, completed, repeatRows] = await Promise.all([
    db
      .select({
        count: count(),
        totalBalance: sum(customer.balanceCents).mapWith(Number),
      })
      .from(customer)
      .where(where),
    db
      .select({
        totalSpent: sum(order.payableCents).mapWith(Number),
        totalDuration: sum(order.durationMin).mapWith(Number),
      })
      .from(order)
      .innerJoin(customer, eq(customer.id, order.customerId))
      .where(and(eq(order.orderStatus, "COMPLETED"), where)),
    db
      .select({ customerId: order.customerId })
      .from(order)
      .innerJoin(customer, eq(customer.id, order.customerId))
      .where(and(eq(order.orderStatus, "COMPLETED"), where))
      .groupBy(order.customerId)
      .having(sql`count(*) >= 2`),
  ]);

  return {
    count: base[0]?.count ?? 0,
    totalBalance: base[0]?.totalBalance ?? 0,
    totalSpent: completed[0]?.totalSpent ?? 0,
    totalDuration: completed[0]?.totalDuration ?? 0,
    repeats: repeatRows.length,
  };
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
  const { from } = rangeOf("today");
  const rangeFrom = new Date(from.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  const now = new Date();

  const shDate = sql`DATE(CONVERT_TZ(${order.startAt}, '+00:00', '+08:00'))`;
  const rows = await db
    .select({
      d: sql<string>`${shDate}`,
      s: sum(order.payableCents).mapWith(Number),
    })
    .from(order)
    .where(and(eq(order.orderStatus, "COMPLETED"), gte(order.startAt, rangeFrom), lte(order.startAt, now)))
    .groupBy(shDate)
    .orderBy(shDate);

  const map = new Map(rows.map((r) => [r.d, r.s ?? 0]));

  const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;
  const shNow = new Date(now.getTime() + now.getTimezoneOffset() * 60_000 + SHANGHAI_OFFSET_MS);
  const results: { date: string; cents: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(shNow);
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    results.push({ date: `${d.getMonth() + 1}/${d.getDate()}`, cents: map.get(key) ?? 0 });
  }
  return results;
}

export async function weekOverWeekRevenue(): Promise<{ thisWeek: number; lastWeek: number }> {
  const { from: thisMonday, to: thisSunday } = rangeOf("week");
  const lastMonday = new Date(thisMonday.getTime() - 7 * 24 * 60 * 60 * 1000);
  const lastSunday = new Date(thisMonday.getTime() - 1);

  const [thisW] = await db.select({ s: sum(order.payableCents).mapWith(Number) }).from(order)
    .where(and(eq(order.orderStatus, "COMPLETED"), gte(order.startAt, thisMonday), lte(order.startAt, thisSunday)));
  const [lastW] = await db.select({ s: sum(order.payableCents).mapWith(Number) }).from(order)
    .where(and(eq(order.orderStatus, "COMPLETED"), gte(order.startAt, lastMonday), lte(order.startAt, lastSunday)));

  return { thisWeek: thisW?.s ?? 0, lastWeek: lastW?.s ?? 0 };
}

export async function overdueUnsettledCount(thresholdDays: number) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - thresholdDays);
  const [row] = await db
    .select({ count: count() })
    .from(order)
    .where(
      and(
        eq(order.settleStatus, "UNSETTLED"),
        or(
          eq(order.orderStatus, "COMPLETED"),
          eq(order.orderStatus, "CANCELED")
        ),
        lte(order.endAt, cutoff)
      )
    );
  return row?.count ?? 0;
}
