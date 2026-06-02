"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { giftRecord, user, GIFT_TIER_CENTS } from "@/db/schema";
import { requireSession } from "@/lib/auth-helpers";
import { DEFAULT_GIFT_FEE_RATE_BP, GIFT_TIER_LABELS } from "@/lib/constants";
import { nanoid } from "../id";
import { logAudit } from "@/server/audit";

const GIFT_TIER_SET = new Set<number>(GIFT_TIER_CENTS);

const upsertSchema = z.object({
  id: z.string().optional(),
  playerId: z.string().min(1, "请选择陪玩"),
  giftTierCents: z
    .number()
    .int()
    .refine((v) => GIFT_TIER_SET.has(v), "档位不合法"),
  quantity: z.number().int().min(1).max(999),
  senderNickname: z.string().trim().min(1, "请填写打赏人昵称").max(100),
  note: z.string().max(500).optional().nullable(),
});

export type UpsertGiftRecordInput = z.input<typeof upsertSchema>;

const listFilterSchema = z.object({
  playerId: z.string().optional(),
  giftTierCents: z.number().int().optional(),
  startAt: z.string().optional().nullable(),
  endAt: z.string().optional().nullable(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(50),
});

export type ListGiftRecordFilter = z.input<typeof listFilterSchema>;

/**
 * 按当前抽成比例(basis points)计算平台抽成与陪玩到手。
 * 用整数运算避免浮点误差。
 */
function computeSplit(totalCents: number, feeRateBp: number) {
  const platformFee = Math.round((totalCents * feeRateBp) / 10000);
  const playerEarn = totalCents - platformFee;
  return { platformFee, playerEarn };
}

function invalidate() {
  revalidatePath("/gifts");
  revalidatePath("/my-gifts");
  revalidatePath("/(authed)", "layout");
}

export async function upsertGiftRecordAction(input: UpsertGiftRecordInput) {
  const { user: me } = await requireSession({ role: ["BOSS", "STAFF"] });
  const parsed = upsertSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.errors[0]?.message ?? "参数错误" };
  }
  const d = parsed.data;

  // 校验陪玩存在且角色为 PLAYER
  const [player] = await db
    .select({ id: user.id, role: user.role, active: user.active, name: user.name })
    .from(user)
    .where(eq(user.id, d.playerId))
    .limit(1);
  if (!player || player.role !== "PLAYER") {
    return { ok: false as const, error: "陪玩不存在" };
  }

  const totalCents = d.giftTierCents * d.quantity;
  const feeRateBp = DEFAULT_GIFT_FEE_RATE_BP;
  const { platformFee, playerEarn } = computeSplit(totalCents, feeRateBp);

  const tierLabel = GIFT_TIER_LABELS[d.giftTierCents] ?? String(d.giftTierCents / 100);

  if (d.id) {
    const [existing] = await db
      .select({ id: giftRecord.id, playerId: giftRecord.playerId, feeRateBp: giftRecord.feeRateBp })
      .from(giftRecord)
      .where(eq(giftRecord.id, d.id))
      .limit(1);
    if (!existing) return { ok: false as const, error: "记录不存在" };

    // 编辑时保留原快照抽成比例,只更新业务字段
    const { platformFee: pf2, playerEarn: pe2 } = computeSplit(totalCents, existing.feeRateBp);
    await db
      .update(giftRecord)
      .set({
        playerId: d.playerId,
        giftTierCents: d.giftTierCents,
        quantity: d.quantity,
        totalCents,
        platformFeeCents: pf2,
        playerEarnCents: pe2,
        senderNickname: d.senderNickname,
        note: d.note?.trim() || null,
        updatedAt: new Date(),
      })
      .where(eq(giftRecord.id, d.id));

    // 如果改了归属陪玩,把新陪玩标记为未读
    if (existing.playerId !== d.playerId) {
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
      giftTierCents: d.giftTierCents,
      quantity: d.quantity,
      totalCents,
      feeRateBp,
      platformFeeCents: platformFee,
      playerEarnCents: playerEarn,
      senderNickname: d.senderNickname,
      note: d.note?.trim() || null,
      operatorId: me.id,
    });
    // 新增记录后标记陪玩为未读,触发红点
    await db
      .update(user)
      .set({ lastGiftSeenAt: null })
      .where(eq(user.id, d.playerId));

    logAudit({
      actorId: me.id,
      actorName: me.name,
      action: "CREATE_GIFT_RECORD",
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
  const { user: me } = await requireSession({ role: ["BOSS", "STAFF"] });
  const [existing] = await db
    .select({
      id: giftRecord.id,
      playerId: giftRecord.playerId,
      giftTierCents: giftRecord.giftTierCents,
      quantity: giftRecord.quantity,
      senderNickname: giftRecord.senderNickname,
    })
    .from(giftRecord)
    .where(eq(giftRecord.id, input.id))
    .limit(1);
  if (!existing) return { ok: false as const, error: "记录不存在" };

  await db.delete(giftRecord).where(eq(giftRecord.id, input.id));
  logAudit({
    actorId: me.id,
    actorName: me.name,
    action: "DELETE_GIFT_RECORD",
    targetType: "gift_record",
    targetId: input.id,
    detail: {
      tier: GIFT_TIER_LABELS[existing.giftTierCents] ?? String(existing.giftTierCents / 100),
      quantity: existing.quantity,
      sender: existing.senderNickname,
    },
  });
  invalidate();
  return { ok: true as const };
}

/** 后台:分页列表 */
export async function listGiftRecords(filter: ListGiftRecordFilter) {
  await requireSession({ role: ["BOSS", "STAFF"] });
  const f = listFilterSchema.parse(filter);

  const conds = [];
  if (f.playerId) conds.push(eq(giftRecord.playerId, f.playerId));
  if (f.giftTierCents) conds.push(eq(giftRecord.giftTierCents, f.giftTierCents));
  if (f.startAt) conds.push(gte(giftRecord.createdAt, new Date(f.startAt)));
  if (f.endAt) conds.push(lte(giftRecord.createdAt, new Date(f.endAt)));
  const where = conds.length > 0 ? and(...conds) : undefined;

  const offset = (f.page - 1) * f.pageSize;

  const [rows, totalRow] = await Promise.all([
    db
      .select({
        id: giftRecord.id,
        playerId: giftRecord.playerId,
        playerName: user.name,
        giftTierCents: giftRecord.giftTierCents,
        quantity: giftRecord.quantity,
        totalCents: giftRecord.totalCents,
        feeRateBp: giftRecord.feeRateBp,
        platformFeeCents: giftRecord.platformFeeCents,
        playerEarnCents: giftRecord.playerEarnCents,
        senderNickname: giftRecord.senderNickname,
        note: giftRecord.note,
        operatorId: giftRecord.operatorId,
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
  ]);

  // 一次性查所有 operator 的 name(避免 N+1)
  const operatorIds = Array.from(new Set(rows.map((r) => r.operatorId)));
  const operators =
    operatorIds.length > 0
      ? await db
          .select({ id: user.id, name: user.name })
          .from(user)
          .where(inArray(user.id, operatorIds))
      : [];
  const operatorMap = new Map(operators.map((o) => [o.id, o.name]));

  return {
    rows: rows.map((r) => ({
      ...r,
      operatorName: operatorMap.get(r.operatorId) ?? "(已删除)",
    })),
    total: totalRow[0]?.count ?? 0,
    page: f.page,
    pageSize: f.pageSize,
  };
}

/** 后台筛选下拉:陪玩列表(精简字段) */
export async function listPlayersForGift() {
  await requireSession({ role: ["BOSS", "STAFF"] });
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

/** 陪玩自己的礼物列表(全量,前端做汇总;一般不会很多条) */
export async function getMyGiftRecords() {
  const { user: me } = await requireSession({ role: "PLAYER" });
  const rows = await db
    .select({
      id: giftRecord.id,
      giftTierCents: giftRecord.giftTierCents,
      quantity: giftRecord.quantity,
      totalCents: giftRecord.totalCents,
      platformFeeCents: giftRecord.platformFeeCents,
      playerEarnCents: giftRecord.playerEarnCents,
      senderNickname: giftRecord.senderNickname,
      note: giftRecord.note,
      createdAt: giftRecord.createdAt,
    })
    .from(giftRecord)
    .where(eq(giftRecord.playerId, me.id))
    .orderBy(desc(giftRecord.createdAt))
    .limit(500);
  return rows;
}

/** 陪玩:未读礼物数量(red dot) */
export async function getMyUnreadGiftCount() {
  const { user: me } = await requireSession();
  if (me.role !== "PLAYER") return { count: 0, since: null as string | null };

  const [u] = await db
    .select({ lastGiftSeenAt: user.lastGiftSeenAt })
    .from(user)
    .where(eq(user.id, me.id))
    .limit(1);
  const since = u?.lastGiftSeenAt ?? null;

  const where = since
    ? and(eq(giftRecord.playerId, me.id), gte(giftRecord.createdAt, since))
    : eq(giftRecord.playerId, me.id);
  const [row] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(giftRecord)
    .where(where);
  return {
    count: row?.count ?? 0,
    since: since ? since.toISOString() : null,
  };
}

/** 陪玩:取未读的具体记录(用于弹窗展示),并标记为已读 */
export async function fetchAndMarkUnreadGifts() {
  const { user: me } = await requireSession({ role: "PLAYER" });
  const [u] = await db
    .select({ lastGiftSeenAt: user.lastGiftSeenAt })
    .from(user)
    .where(eq(user.id, me.id))
    .limit(1);
  const since = u?.lastGiftSeenAt ?? null;

  const where = since
    ? and(eq(giftRecord.playerId, me.id), gte(giftRecord.createdAt, since))
    : eq(giftRecord.playerId, me.id);
  const rows = await db
    .select({
      id: giftRecord.id,
      giftTierCents: giftRecord.giftTierCents,
      quantity: giftRecord.quantity,
      totalCents: giftRecord.totalCents,
      platformFeeCents: giftRecord.platformFeeCents,
      playerEarnCents: giftRecord.playerEarnCents,
      senderNickname: giftRecord.senderNickname,
      createdAt: giftRecord.createdAt,
    })
    .from(giftRecord)
    .where(where)
    .orderBy(desc(giftRecord.createdAt))
    .limit(20);

  // 标记已读:把 lastGiftSeenAt 推到当前最新一条记录之后(用 now 即可)
  await db
    .update(user)
    .set({ lastGiftSeenAt: new Date() })
    .where(eq(user.id, me.id));

  revalidatePath("/(authed)", "layout");
  return rows.map((r) => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
  }));
}
