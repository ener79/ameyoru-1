"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq, gt, gte, inArray, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { giftRecord, giftTemplate, user } from "@/db/schema";
import { requireSession } from "@/lib/auth-helpers";
import { getAffectedRows } from "@/lib/db-utils";
import { DEFAULT_GIFT_FEE_RATE_BP, MAX_AMOUNT_CENTS } from "@/lib/constants";
import { nanoid } from "../id";
import { logAudit } from "@/server/audit";

const upsertSchema = z.object({
  id: z.string().optional(),
  playerId: z.string().min(1, "请选择陪玩"),
  giftTemplateId: z.string().min(1, "请选择礼物"),
  quantity: z.number().int().min(1).max(999),
  senderNickname: z.string().trim().min(1, "请填写打赏人昵称").max(100),
  note: z.string().max(500).optional().nullable(),
});

export type UpsertGiftRecordInput = z.input<typeof upsertSchema>;

const listFilterSchema = z.object({
  playerId: z.string().optional(),
  giftTierCents: z.number().int().optional(),
  settleStatus: z.enum(["UNSETTLED", "SETTLED"]).optional(),
  startAt: z.string().optional().nullable(),
  endAt: z.string().optional().nullable(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(50),
});

export type ListGiftRecordFilter = z.input<typeof listFilterSchema>;

function computeSplit(totalCents: number, feeRateBp: number) {
  const platformFee = Math.round((totalCents * feeRateBp) / 10000);
  const playerEarn = totalCents - platformFee;
  return { platformFee, playerEarn };
}

function invalidate() {
  revalidatePath("/gifts");
  revalidatePath("/my-gifts");
  revalidatePath("/leaderboard");
  revalidatePath("/gifts", "layout");
  revalidatePath("/my-gifts", "layout");
}

function giftVisibleAt() {
  return sql<Date>`COALESCE(${giftRecord.settledAt}, ${giftRecord.createdAt})`;
}

/**
 * 新增/编辑礼物报单。
 * 权限:
 *   - BOSS/STAFF: 可为任意陪玩创建,可改任意条记录
 *   - PLAYER: 只能为自己创建,只能改自己提交的且 UNSETTLED 的记录
 */
export async function upsertGiftRecordAction(input: UpsertGiftRecordInput) {
  const { user: me } = await requireSession();
  const isManager = me.role === "BOSS" || me.role === "STAFF" || me.role === "SERVICE";
  if (!isManager && me.role !== "PLAYER") {
    return { ok: false as const, error: "无权限" };
  }

  const parsed = upsertSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.errors[0]?.message ?? "参数错误" };
  }
  const d = parsed.data;

  if (me.role === "PLAYER" && d.playerId !== me.id) {
    return { ok: false as const, error: "陪玩只能给自己报单" };
  }

  const [player] = await db
    .select({ id: user.id, role: user.role, active: user.active, name: user.name })
    .from(user)
    .where(eq(user.id, d.playerId))
    .limit(1);
  if (!player || player.role !== "PLAYER") {
    return { ok: false as const, error: "陪玩不存在" };
  }

  // Look up the gift template
  const [template] = await db
    .select({ id: giftTemplate.id, name: giftTemplate.name, priceCents: giftTemplate.priceCents })
    .from(giftTemplate)
    .where(and(eq(giftTemplate.id, d.giftTemplateId), eq(giftTemplate.active, true)))
    .limit(1);
  if (!template) return { ok: false as const, error: "礼物不存在或已停用" };

  const totalCents = template.priceCents * d.quantity;
  if (totalCents > MAX_AMOUNT_CENTS) {
    return { ok: false as const, error: "礼物总金额超出上限" };
  }
  const feeRateBp = DEFAULT_GIFT_FEE_RATE_BP;
  const { platformFee, playerEarn } = computeSplit(totalCents, feeRateBp);

  const tierLabel = template.name + " " + (template.priceCents / 100) + "元";

  if (d.id) {
    const [existing] = await db
      .select({
        id: giftRecord.id,
        playerId: giftRecord.playerId,
        feeRateBp: giftRecord.feeRateBp,
        settleStatus: giftRecord.settleStatus,
        submitterId: giftRecord.submitterId,
      })
      .from(giftRecord)
      .where(eq(giftRecord.id, d.id))
      .limit(1);
    if (!existing) return { ok: false as const, error: "记录不存在" };

    if (me.role === "PLAYER") {
      if (existing.submitterId !== me.id) {
        return { ok: false as const, error: "只能编辑自己提交的报单" };
      }
      if (existing.settleStatus === "SETTLED") {
        return { ok: false as const, error: "已支付的报单不能修改,请联系管理员" };
      }
    }

    const { platformFee: pf2, playerEarn: pe2 } = computeSplit(totalCents, existing.feeRateBp);
    await db
      .update(giftRecord)
      .set({
        playerId: d.playerId,
        giftTierCents: template.priceCents,
        giftName: template.name,
        giftTemplateId: template.id,
        quantity: d.quantity,
        totalCents,
        platformFeeCents: pf2,
        playerEarnCents: pe2,
        senderNickname: d.senderNickname,
        note: d.note?.trim() || null,
        updatedAt: new Date(),
      })
      .where(eq(giftRecord.id, d.id));

    if (existing.playerId !== d.playerId && existing.settleStatus === "SETTLED") {
      await db
        .update(user)
        .set({ lastGiftSeenAt: null })
        .where(eq(user.id, d.playerId));
    }

    logAudit({
      actorId: me.id,
      actorName: me.name,
      action: "UPDATE_GIFT_RECORD",
      targetType: "gift_record",
      targetId: d.id,
      detail: {
        playerName: player.name,
        tier: tierLabel,
        quantity: d.quantity,
        sender: d.senderNickname,
      },
    });
  } else {
    const id = nanoid();
    await db.insert(giftRecord).values({
      id,
      playerId: d.playerId,
      giftTierCents: template.priceCents,
      giftName: template.name,
      giftTemplateId: template.id,
      quantity: d.quantity,
      totalCents,
      feeRateBp,
      platformFeeCents: platformFee,
      playerEarnCents: playerEarn,
      senderNickname: d.senderNickname,
      note: d.note?.trim() || null,
      operatorId: me.id,
      submitterId: me.id,
      settleStatus: "UNSETTLED",
    });
    logAudit({
      actorId: me.id,
      actorName: me.name,
      action: me.role === "PLAYER" ? "CREATE_GIFT_REPORT" : "CREATE_GIFT_RECORD",
      targetType: "gift_record",
      targetId: id,
      detail: {
        playerName: player.name,
        tier: tierLabel,
        quantity: d.quantity,
        sender: d.senderNickname,
      },
    });
  }

  invalidate();
  return { ok: true as const };
}

export async function deleteGiftRecordAction(input: { id: string }) {
  const { user: me } = await requireSession();
  const isManager = me.role === "BOSS" || me.role === "STAFF" || me.role === "SERVICE";
  if (!isManager && me.role !== "PLAYER") {
    return { ok: false as const, error: "无权限" };
  }

  const [existing] = await db
    .select({
      id: giftRecord.id,
      playerId: giftRecord.playerId,
      giftTierCents: giftRecord.giftTierCents,
      giftName: giftRecord.giftName,
      quantity: giftRecord.quantity,
      senderNickname: giftRecord.senderNickname,
      settleStatus: giftRecord.settleStatus,
      submitterId: giftRecord.submitterId,
    })
    .from(giftRecord)
    .where(eq(giftRecord.id, input.id))
    .limit(1);
  if (!existing) return { ok: false as const, error: "记录不存在" };

  if (me.role === "PLAYER") {
    if (existing.submitterId !== me.id) {
      return { ok: false as const, error: "只能删除自己提交的报单" };
    }
    if (existing.settleStatus === "SETTLED") {
      return { ok: false as const, error: "已支付的报单不能删除" };
    }
  }

  await db.delete(giftRecord).where(eq(giftRecord.id, input.id));
  logAudit({
    actorId: me.id,
    actorName: me.name,
    action: "DELETE_GIFT_RECORD",
    targetType: "gift_record",
    targetId: input.id,
    detail: {
      tier: existing.giftName ?? `${existing.giftTierCents / 100}元`,
      quantity: existing.quantity,
      sender: existing.senderNickname,
    },
  });
  invalidate();
  return { ok: true as const };
}

const settleGiftSchema = z.object({
  id: z.string().min(1),
  paidMethod: z.enum(["WECHAT", "ALIPAY"]).optional(),
});

/** 后台:标记礼物报单为已支付 */
export async function settleGiftAction(input: z.input<typeof settleGiftSchema>) {
  const { user: me } = await requireSession({ role: ["BOSS", "STAFF"] });
  const parsed = settleGiftSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.errors[0]?.message ?? "参数错误" };
  }
  const result = await db
    .update(giftRecord)
    .set({
      settleStatus: "SETTLED",
      settledAt: new Date(),
      paidMethod: parsed.data.paidMethod ?? null,
      updatedAt: new Date(),
    })
    .where(and(eq(giftRecord.id, parsed.data.id), eq(giftRecord.settleStatus, "UNSETTLED")));
  if (getAffectedRows(result) !== 1) {
    const [current] = await db
      .select({ settleStatus: giftRecord.settleStatus })
      .from(giftRecord)
      .where(eq(giftRecord.id, parsed.data.id))
      .limit(1);
    if (!current) return { ok: false as const, error: "记录不存在" };
    if (current.settleStatus === "SETTLED") {
      return { ok: false as const, error: "已支付,请勿重复操作" };
    }
    return { ok: false as const, error: "操作失败,请重试" };
  }

  const [target] = await db
    .select({ playerEarnCents: giftRecord.playerEarnCents })
    .from(giftRecord)
    .where(eq(giftRecord.id, parsed.data.id))
    .limit(1);

  logAudit({
    actorId: me.id,
    actorName: me.name,
    action: "SETTLE_GIFT",
    targetType: "gift_record",
    targetId: parsed.data.id,
    detail: { amount: target?.playerEarnCents, paidMethod: parsed.data.paidMethod },
  });

  invalidate();
  return { ok: true as const };
}

export async function unsettleGiftAction(input: { id: string }) {
  const { user: me } = await requireSession({ role: ["BOSS", "STAFF"] });
  const [giftInfo] = await db
    .select({ playerName: user.name, playerEarnCents: giftRecord.playerEarnCents })
    .from(giftRecord)
    .innerJoin(user, eq(user.id, giftRecord.playerId))
    .where(eq(giftRecord.id, input.id))
    .limit(1);
  const result = await db
    .update(giftRecord)
    .set({
      settleStatus: "UNSETTLED",
      settledAt: null,
      paidMethod: null,
      updatedAt: new Date(),
    })
    .where(and(eq(giftRecord.id, input.id), eq(giftRecord.settleStatus, "SETTLED")));
  if (getAffectedRows(result) !== 1) {
    const [current] = await db
      .select({ settleStatus: giftRecord.settleStatus })
      .from(giftRecord)
      .where(eq(giftRecord.id, input.id))
      .limit(1);
    if (!current) return { ok: false as const, error: "记录不存在" };
    if (current.settleStatus !== "SETTLED") {
      return { ok: false as const, error: "该报单未支付,无需撤销" };
    }
    return { ok: false as const, error: "操作失败,请重试" };
  }
  logAudit({
    actorId: me.id,
    actorName: me.name,
    action: "UNSETTLE_GIFT",
    targetType: "gift_record",
    targetId: input.id,
    detail: giftInfo ? { playerName: giftInfo.playerName, amount: giftInfo.playerEarnCents } : undefined,
  });
  invalidate();
  return { ok: true as const };
}

export async function listGiftRecords(filter: ListGiftRecordFilter) {
  await requireSession({ role: ["BOSS", "STAFF", "SERVICE"] });
  const parsed = listFilterSchema.safeParse(filter);
  if (!parsed.success) return { records: [], total: 0, pendingCount: 0, rows: [], page: 1, pageSize: 50 };
  const f = parsed.data;

  const conds = [];
  if (f.playerId) conds.push(eq(giftRecord.playerId, f.playerId));
  if (f.giftTierCents) conds.push(eq(giftRecord.giftTierCents, f.giftTierCents));
  if (f.settleStatus) conds.push(eq(giftRecord.settleStatus, f.settleStatus));
  if (f.startAt) conds.push(gte(giftRecord.createdAt, new Date(f.startAt)));
  if (f.endAt) conds.push(lte(giftRecord.createdAt, new Date(f.endAt)));
  const where = conds.length > 0 ? and(...conds) : undefined;

  const offset = (f.page - 1) * f.pageSize;

  const [rows, totalRow, pendingCountRow] = await Promise.all([
    db
      .select({
        id: giftRecord.id,
        playerId: giftRecord.playerId,
        playerName: user.name,
        playerWechatQrPath: user.wechatQrPath,
        playerAlipayQrPath: user.alipayQrPath,
        giftTierCents: giftRecord.giftTierCents,
        giftName: giftRecord.giftName,
        giftTemplateId: giftRecord.giftTemplateId,
        quantity: giftRecord.quantity,
        totalCents: giftRecord.totalCents,
        feeRateBp: giftRecord.feeRateBp,
        platformFeeCents: giftRecord.platformFeeCents,
        playerEarnCents: giftRecord.playerEarnCents,
        senderNickname: giftRecord.senderNickname,
        note: giftRecord.note,
        operatorId: giftRecord.operatorId,
        submitterId: giftRecord.submitterId,
        settleStatus: giftRecord.settleStatus,
        settledAt: giftRecord.settledAt,
        paidMethod: giftRecord.paidMethod,
        createdAt: giftRecord.createdAt,
      })
      .from(giftRecord)
      .innerJoin(user, eq(user.id, giftRecord.playerId))
      .where(where)
      .orderBy(desc(giftRecord.createdAt))
      .limit(f.pageSize)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(giftRecord)
      .where(where),
    db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(giftRecord)
      .where(eq(giftRecord.settleStatus, "UNSETTLED")),
  ]);

  const idsToLookup = Array.from(
    new Set(rows.flatMap((r) => [r.operatorId, r.submitterId]))
  );
  const operators =
    idsToLookup.length > 0
      ? await db
          .select({ id: user.id, name: user.name })
          .from(user)
          .where(inArray(user.id, idsToLookup))
      : [];
  const nameMap = new Map(operators.map((o) => [o.id, o.name]));

  return {
    rows: rows.map((r) => ({
      ...r,
      operatorName: nameMap.get(r.operatorId) ?? "(已删除)",
      submitterName: nameMap.get(r.submitterId) ?? "(已删除)",
    })),
    total: totalRow[0]?.count ?? 0,
    pendingCount: pendingCountRow[0]?.count ?? 0,
    page: f.page,
    pageSize: f.pageSize,
  };
}

export async function listPlayersForGift() {
  await requireSession({ role: ["BOSS", "STAFF", "SERVICE"] });
  return db
    .select({
      id: user.id,
      name: user.name,
      username: user.username,
      active: user.active,
    })
    .from(user)
    .where(eq(user.role, "PLAYER"))
    .orderBy(desc(user.active), user.name);
}

/* ----------------------------- 陪玩端 ----------------------------- */

export async function getMyGiftRecords(opts: { tab?: "all" | "pending" | "settled"; limit?: number; offset?: number } = {}) {
  const { user: me } = await requireSession({ role: "PLAYER" });
  const conds = [eq(giftRecord.playerId, me.id)];
  if (opts.tab === "pending") conds.push(eq(giftRecord.settleStatus, "UNSETTLED"));
  if (opts.tab === "settled") conds.push(eq(giftRecord.settleStatus, "SETTLED"));
  const rows = await db
    .select({
      id: giftRecord.id,
      giftTierCents: giftRecord.giftTierCents,
      giftName: giftRecord.giftName,
      giftTemplateId: giftRecord.giftTemplateId,
      quantity: giftRecord.quantity,
      totalCents: giftRecord.totalCents,
      platformFeeCents: giftRecord.platformFeeCents,
      playerEarnCents: giftRecord.playerEarnCents,
      senderNickname: giftRecord.senderNickname,
      note: giftRecord.note,
      settleStatus: giftRecord.settleStatus,
      settledAt: giftRecord.settledAt,
      paidMethod: giftRecord.paidMethod,
      submitterId: giftRecord.submitterId,
      createdAt: giftRecord.createdAt,
    })
    .from(giftRecord)
    .where(and(...conds))
    .orderBy(desc(giftRecord.createdAt))
    .limit(opts.limit ?? 500)
    .offset(opts.offset ?? 0);
  return rows;
}

/** 陪玩:礼物收入汇总(今日/本月/累计已支付 + 待支付数),不受分页影响 */
export async function getMyGiftStats() {
  const { user: me } = await requireSession({ role: "PLAYER" });
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const settledEarn = (since: Date) =>
    sql<number>`coalesce(sum(case when ${giftRecord.settleStatus} = 'SETTLED' and ${giftRecord.createdAt} >= ${since} then ${giftRecord.playerEarnCents} else 0 end), 0)`.mapWith(Number);
  const settledCount = (since: Date) =>
    sql<number>`count(case when ${giftRecord.settleStatus} = 'SETTLED' and ${giftRecord.createdAt} >= ${since} then 1 end)`.mapWith(Number);

  const [row] = await db
    .select({
      todayCount: settledCount(todayStart),
      todayEarn: settledEarn(todayStart),
      monthCount: settledCount(monthStart),
      monthEarn: settledEarn(monthStart),
      totalCount: sql<number>`count(case when ${giftRecord.settleStatus} = 'SETTLED' then 1 end)`.mapWith(Number),
      totalEarn: sql<number>`coalesce(sum(case when ${giftRecord.settleStatus} = 'SETTLED' then ${giftRecord.playerEarnCents} else 0 end), 0)`.mapWith(Number),
      pending: sql<number>`count(case when ${giftRecord.settleStatus} = 'UNSETTLED' then 1 end)`.mapWith(Number),
    })
    .from(giftRecord)
    .where(eq(giftRecord.playerId, me.id));

  return {
    today: { count: row?.todayCount ?? 0, earn: row?.todayEarn ?? 0 },
    month: { count: row?.monthCount ?? 0, earn: row?.monthEarn ?? 0 },
    total: { count: row?.totalCount ?? 0, earn: row?.totalEarn ?? 0 },
    pending: row?.pending ?? 0,
  };
}

/** 陪玩:未读数(只算 SETTLED) */
export async function getMyUnreadGiftCount() {
  const { user: me } = await requireSession();
  if (me.role !== "PLAYER") return { count: 0, since: null as string | null };

  const [u] = await db
    .select({ lastGiftSeenAt: user.lastGiftSeenAt })
    .from(user)
    .where(eq(user.id, me.id))
    .limit(1);
  const since = u?.lastGiftSeenAt ?? null;

  const baseConds = [
    eq(giftRecord.playerId, me.id),
    eq(giftRecord.settleStatus, "SETTLED"),
  ];
  if (since) baseConds.push(gt(giftVisibleAt(), since));
  const [row] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(giftRecord)
    .where(and(...baseConds));
  return {
    count: row?.count ?? 0,
    since: since ? since.toISOString() : null,
  };
}

export async function fetchAndMarkUnreadGifts() {
  const { user: me } = await requireSession({ role: "PLAYER" });
  const [u] = await db
    .select({ lastGiftSeenAt: user.lastGiftSeenAt })
    .from(user)
    .where(eq(user.id, me.id))
    .limit(1);
  const since = u?.lastGiftSeenAt ?? null;
  const seenAt = new Date();

  const baseConds = [
    eq(giftRecord.playerId, me.id),
    eq(giftRecord.settleStatus, "SETTLED"),
    lte(giftVisibleAt(), seenAt),
  ];
  if (since) baseConds.push(gt(giftVisibleAt(), since));
  const rows = await db
    .select({
      id: giftRecord.id,
      giftTierCents: giftRecord.giftTierCents,
      giftName: giftRecord.giftName,
      quantity: giftRecord.quantity,
      totalCents: giftRecord.totalCents,
      platformFeeCents: giftRecord.platformFeeCents,
      playerEarnCents: giftRecord.playerEarnCents,
      senderNickname: giftRecord.senderNickname,
      createdAt: giftRecord.createdAt,
    })
    .from(giftRecord)
    .where(and(...baseConds))
    .orderBy(desc(giftVisibleAt()), desc(giftRecord.createdAt))
    .limit(20);

  await db
    .update(user)
    .set({ lastGiftSeenAt: seenAt })
    .where(eq(user.id, me.id));

  return rows.map((r) => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
  }));
}

/* ----------------------------- 排行榜 ----------------------------- */

const rangeSchema = z.enum(["today", "week", "month", "all"]).default("all");

function rangeStart(range: z.infer<typeof rangeSchema>): Date | null {
  if (range === "all") return null;
  const now = new Date();
  if (range === "today") {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (range === "week") {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return d;
  }
  if (range === "month") {
    const d = new Date(now);
    d.setMonth(d.getMonth() - 1);
    return d;
  }
  return null;
}

/**
 * 礼物打赏排行榜:只统计已支付的记录,展示"谁打赏谁"。
 */
export async function giftLeaderboard(range: "today" | "week" | "month" | "all" = "all") {
  const { user: me } = await requireSession();
  const isManager = me.role === "BOSS" || me.role === "STAFF" || me.role === "SERVICE";
  const parsed = rangeSchema.safeParse(range);
  if (!parsed.success) return { senders: [], players: [], pairs: [] };
  const r = parsed.data;
  const since = rangeStart(r);

  const baseConds = [eq(giftRecord.settleStatus, "SETTLED")];
  if (since) baseConds.push(gte(giftVisibleAt(), since));
  const where = and(...baseConds);

  const playerRows = await db
    .select({
      playerId: giftRecord.playerId,
      playerName: user.name,
      totalCents: sql<number>`SUM(${giftRecord.totalCents})`.mapWith(Number),
      earnCents: sql<number>`SUM(${giftRecord.playerEarnCents})`.mapWith(Number),
      giftCount: sql<number>`COUNT(*)`.mapWith(Number),
    })
    .from(giftRecord)
    .innerJoin(user, eq(user.id, giftRecord.playerId))
    .where(where)
    .groupBy(giftRecord.playerId, user.name)
    .orderBy(sql`SUM(${giftRecord.totalCents}) DESC`)
    .limit(50);

  if (!isManager) {
    return {
      senders: [],
      players: playerRows.map((p) => ({
        ...p,
        totalCents: null,
        earnCents: p.playerId === me.id ? p.earnCents : null,
      })),
      pairs: [],
    };
  }

  const senderRows = await db
    .select({
      senderNickname: giftRecord.senderNickname,
      totalCents: sql<number>`SUM(${giftRecord.totalCents})`.mapWith(Number),
      giftCount: sql<number>`COUNT(*)`.mapWith(Number),
      quantitySum: sql<number>`SUM(${giftRecord.quantity})`.mapWith(Number),
    })
    .from(giftRecord)
    .where(where)
    .groupBy(giftRecord.senderNickname)
    .orderBy(sql`SUM(${giftRecord.totalCents}) DESC`)
    .limit(50);

  const pairRows = await db
    .select({
      senderNickname: giftRecord.senderNickname,
      playerId: giftRecord.playerId,
      playerName: user.name,
      totalCents: sql<number>`SUM(${giftRecord.totalCents})`.mapWith(Number),
      giftCount: sql<number>`COUNT(*)`.mapWith(Number),
    })
    .from(giftRecord)
    .innerJoin(user, eq(user.id, giftRecord.playerId))
    .where(where)
    .groupBy(giftRecord.senderNickname, giftRecord.playerId, user.name)
    .orderBy(sql`SUM(${giftRecord.totalCents}) DESC`)
    .limit(100);

  return { senders: senderRows, players: playerRows, pairs: pairRows };
}
