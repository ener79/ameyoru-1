"use server";

import { revalidatePath } from "next/cache";
import { and, eq, gt, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { order, customer, customerBalanceTxn, user } from "@/db/schema";
import { requireSession } from "@/lib/auth-helpers";
import { getAffectedRows } from "@/lib/db-utils";
import { computeOrder } from "@/lib/calc";
import { yuanStringToCents } from "@/lib/format";
import { DEFAULT_COMMISSION_PER_HOUR_CENTS, GAME_SERVERS, MAX_AMOUNT_CENTS } from "@/lib/constants";
import { generateMemberNo, nanoid } from "../id";
import { logAudit } from "../audit";
import {
  notifyOrderCreated,
  notifyOrderCompleted,
  notifyOrderSettled,
  notifyOrderCanceled,
} from "@/lib/wecom";
import { optionalTrimmed } from "@/lib/validation";

const CANCELABLE_ORDER_STATUSES = ["IN_PROGRESS", "COMPLETED"] as const;

function settlableOrderCondition() {
  return or(
    eq(order.orderStatus, "COMPLETED"),
    and(
      eq(order.orderStatus, "CANCELED"),
      gt(order.playerCompensationCents, 0)
    )
  );
}

const createSchema = z.object({
  playerId: z.string().optional(),
  customerId: z.string().optional(),
  customerName: z
    .string()
    .min(1, "请填写客户名")
    .max(32)
    .transform((s) => s.trim())
    .refine((s) => s.length > 0, "客户名不能全为空格"),
  customerWechat: optionalTrimmed(64),
  gameServer: z.enum(GAME_SERVERS, { required_error: "请选择大区" }),
  startAt: z.string(),
  endAt: z.string(),
  hourlyRateYuan: z.string(),
  discountYuan: z.string().optional(),
  usePrepay: z.boolean().optional(),
  note: z.string().optional().nullable(),
});

export type CreateOrderInput = z.input<typeof createSchema>;

function invalidatePages(orderId?: string) {
  revalidatePath("/overview");
  revalidatePath("/orders");
  revalidatePath("/payouts");
  revalidatePath("/leaderboard");
  revalidatePath("/customers");
  if (orderId) revalidatePath(`/orders?id=${orderId}`);
}

async function findOrCreateCustomer(opts: {
  id?: string;
  name: string;
  wechat?: string | null;
}) {
  if (opts.id) {
    const [picked] = await db
      .select({
        id: customer.id,
        memberNo: customer.memberNo,
        balanceCents: customer.balanceCents,
        name: customer.name,
      })
      .from(customer)
      .where(eq(customer.id, opts.id))
      .limit(1);
    if (!picked) throw new Error("客户不存在");
    return { ...picked, isNew: false };
  }

  const [existing] = await db
    .select({
      id: customer.id,
      memberNo: customer.memberNo,
      balanceCents: customer.balanceCents,
      name: customer.name,
    })
    .from(customer)
    .where(eq(customer.name, opts.name))
    .limit(1);
  if (existing) return { ...existing, isNew: false };

  for (let i = 0; i < 5; i++) {
    const memberNo = generateMemberNo();
    const [dup] = await db
      .select({ id: customer.id })
      .from(customer)
      .where(eq(customer.memberNo, memberNo))
      .limit(1);
    if (dup) continue;
    const id = nanoid();
    await db
      .insert(customer)
      .values({ id, memberNo, name: opts.name, wechat: opts.wechat ?? null });
    return {
      id,
      memberNo,
      balanceCents: 0,
      name: opts.name,
      isNew: true,
    };
  }
  throw new Error("会员号生成冲突,请重试");
}

export async function createOrderAction(input: CreateOrderInput) {
  const { user: me } = await requireSession();
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.errors[0]?.message ?? "参数错误",
    };
  }
  const data = parsed.data;

  const playerId = me.role === "PLAYER" ? me.id : data.playerId;
  if (!playerId) {
    return { ok: false as const, error: "请选择陪玩" };
  }

  const [selectedPlayer] = await db
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(
      and(eq(user.id, playerId), eq(user.role, "PLAYER"), eq(user.active, true))
    )
    .limit(1);
  if (!selectedPlayer) {
    return { ok: false as const, error: "陪玩不存在或已停用" };
  }

  let customerRec: Awaited<ReturnType<typeof findOrCreateCustomer>>;
  try {
    customerRec = await findOrCreateCustomer({
      id: data.customerId,
      name: data.customerName,
      wechat: data.customerWechat,
    });
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "客户错误",
    };
  }

  const startAt = new Date(data.startAt);
  const endAt = new Date(data.endAt);
  if (isNaN(startAt.getTime()) || isNaN(endAt.getTime())) {
    return { ok: false as const, error: "时间格式无效" };
  }

  // 陪玩自报:开始时间不能超过当前时间 2 小时(防止误选明天)
  if (me.role === "PLAYER") {
    const maxFutureMs = 2 * 60 * 60 * 1000;
    if (startAt.getTime() > Date.now() + maxFutureMs) {
      return { ok: false as const, error: "开始时间异常,请检查日期是否选到了明天" };
    }
  }

  let hourlyRateCents: number;
  if (me.role === "PLAYER") {
    const [p] = await db
      .select({ defaultRateCents: user.defaultRateCents })
      .from(user)
      .where(eq(user.id, me.id))
      .limit(1);
    const defaultRate = p?.defaultRateCents ?? 0;
    hourlyRateCents = yuanStringToCents(data.hourlyRateYuan);
    if (defaultRate > 0 && hourlyRateCents > defaultRate) {
      return { ok: false as const, error: `单价不能高于默认单价(${defaultRate / 100} 元/小时)` };
    }
  } else {
    hourlyRateCents = yuanStringToCents(data.hourlyRateYuan);
  }
  if (hourlyRateCents <= 0) {
    return { ok: false as const, error: "单价必须大于 0" };
  }
  if (hourlyRateCents > MAX_AMOUNT_CENTS) {
    return { ok: false as const, error: "单价超出上限" };
  }
  // 单价必须 ≥ 抽成时薪,否则陪玩应得为负,订单会卡死无法取消/结算
  if (hourlyRateCents < DEFAULT_COMMISSION_PER_HOUR_CENTS) {
    return {
      ok: false as const,
      error: `单价不能低于抽成时薪(${DEFAULT_COMMISSION_PER_HOUR_CENTS / 100} 元/小时)`,
    };
  }

  // 陪玩自报不允许填优惠;客服不允许填优惠
  const discountCents =
    me.role === "PLAYER" || me.role === "SERVICE" || !data.discountYuan
      ? 0
      : yuanStringToCents(data.discountYuan);
  if (discountCents > MAX_AMOUNT_CENTS) {
    return { ok: false as const, error: "优惠金额超出上限" };
  }

  const computed = computeOrder({
    startAt,
    endAt,
    hourlyRateCents,
    discountCents,
    commissionPerHourCents: DEFAULT_COMMISSION_PER_HOUR_CENTS,
  });
  if (computed.durationMin <= 0) {
    return { ok: false as const, error: "时长必须大于 0" };
  }
  if (computed.discountCents > computed.originalCents) {
    return { ok: false as const, error: "优惠不能超过原价" };
  }

  // 跨零点:endAt < startAt 时 +1 天
  const endAtStored =
    endAt.getTime() < startAt.getTime()
      ? new Date(endAt.getTime() + 24 * 60 * 60 * 1000)
      : endAt;

  const id = nanoid();
  const canUsePrepay = me.role !== "PLAYER" && me.role !== "SERVICE" && !!data.usePrepay;
  let prepayUsedCents = 0;
  await db.transaction(async (tx) => {
    const [currentCustomer] = await tx
      .select({ balanceCents: customer.balanceCents })
      .from(customer)
      .where(eq(customer.id, customerRec.id))
      .limit(1);
    prepayUsedCents = canUsePrepay
      ? Math.min(currentCustomer?.balanceCents ?? 0, computed.payableCents)
      : 0;

    await tx.insert(order).values({
      id,
      dispatcherId: me.id,
      playerId,
      customerId: customerRec.id,
      startAt,
      endAt: endAtStored,
      durationMin: computed.durationMin,
      hourlyRateCents,
      commissionPerHourCents: computed.commissionPerHourCents,
      originalCents: computed.originalCents,
      discountCents: computed.discountCents,
      payableCents: computed.payableCents,
      prepayUsedCents,
      commissionCents: computed.commissionCents,
      playerEarnCents: computed.playerEarnCents,
      gameServer: data.gameServer,
      note: data.note ?? null,
    });

    if (prepayUsedCents > 0) {
      await tx
        .update(customer)
        .set({
          balanceCents: sql`${customer.balanceCents} - ${prepayUsedCents}`,
        })
        .where(eq(customer.id, customerRec.id));
      await tx.insert(customerBalanceTxn).values({
        id: nanoid(),
        customerId: customerRec.id,
        orderId: id,
        type: "ORDER_DEBIT",
        amountCents: -prepayUsedCents,
        note: "订单预存抵扣",
        createdById: me.id,
      });
    }
  });

  invalidatePages();

  notifyOrderCreated({
    dispatcherName: me.name,
    customerName: customerRec.name,
    durationMin: computed.durationMin,
    payableCents: computed.payableCents,
    discountCents: computed.discountCents,
    isSelfReport: me.role === "PLAYER",
  });
  logAudit({ actorId: me.id, actorName: me.name, action: "CREATE_ORDER", targetType: "order", targetId: id, detail: { playerName: selectedPlayer.name, customerName: customerRec.name, payableCents: computed.payableCents, durationMin: computed.durationMin } });

  return {
    ok: true as const,
    id,
    newCustomer: customerRec.isNew
      ? { name: customerRec.name, memberNo: customerRec.memberNo }
      : null,
  };
}

export async function completeOrderAction(input: { id: string }) {
  const { user: me } = await requireSession({ role: ["BOSS", "STAFF", "SERVICE"] });
  const [target] = await db
    .select({
      playerId: order.playerId,
      orderStatus: order.orderStatus,
      payableCents: order.payableCents,
      playerEarnCents: order.playerEarnCents,
      playerName: user.name,
      customerName: customer.name,
    })
    .from(order)
    .innerJoin(user, eq(user.id, order.playerId))
    .innerJoin(customer, eq(customer.id, order.customerId))
    .where(eq(order.id, input.id))
    .limit(1);
  if (!target) return { ok: false as const, error: "订单不存在" };
  if (target.orderStatus !== "IN_PROGRESS") {
    return { ok: false as const, error: "订单已不是进行中状态" };
  }
  await db
    .update(order)
    .set({
      orderStatus: "COMPLETED",
      completedAt: new Date(),
      collectorName: me.role !== "BOSS" ? me.name : null,
    })
    .where(eq(order.id, input.id));
  invalidatePages(input.id);

  notifyOrderCompleted({
    actorName: me.name,
    payableCents: target.payableCents,
    playerEarnCents: target.playerEarnCents,
  });
  logAudit({ actorId: me.id, actorName: me.name, action: "COMPLETE_ORDER", targetType: "order", targetId: input.id, detail: { playerName: target.playerName, customerName: target.customerName, payableCents: target.payableCents } });

  return { ok: true as const };
}

/**
 * 老板/店长:给已完成未结的订单增加时长(例如老板送单)。
 * 只在 COMPLETED + UNSETTLED 状态下可用。
 */
const adjustSchema = z.object({
  id: z.string(),
  extraMinutes: z.number().int().min(1, "至少增加 1 分钟").max(24 * 60, "单次最多增加 24 小时"),
  note: z
    .string()
    .max(500)
    .optional()
    .transform((s) => s?.trim() || null),
});

const adjustRateSchema = z.object({
  id: z.string(),
  hourlyRateYuan: z.string(),
});

export async function adjustOrderDurationAction(
  input: z.infer<typeof adjustSchema>
) {
  const { user: me } = await requireSession({ role: ["BOSS", "STAFF"] });
  const parsed = adjustSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.errors[0]?.message ?? "参数错误",
    };
  }

  const [target] = await db
    .select({
      id: order.id,
      orderStatus: order.orderStatus,
      settleStatus: order.settleStatus,
      startAt: order.startAt,
      durationMin: order.durationMin,
      hourlyRateCents: order.hourlyRateCents,
      commissionPerHourCents: order.commissionPerHourCents,
      discountCents: order.discountCents,
      note: order.note,
      playerName: user.name,
    })
    .from(order)
    .innerJoin(user, eq(user.id, order.playerId))
    .where(eq(order.id, parsed.data.id))
    .limit(1);
  if (!target) return { ok: false as const, error: "订单不存在" };
  if (target.orderStatus !== "COMPLETED") {
    return { ok: false as const, error: "只能对已完成的订单增加时长" };
  }
  if (target.settleStatus !== "UNSETTLED") {
    return { ok: false as const, error: "已结算的订单不能修改" };
  }

  const newDurationMin = target.durationMin + parsed.data.extraMinutes;
  const newEndAt = new Date(
    target.startAt.getTime() + newDurationMin * 60000
  );
  const computed = computeOrder({
    startAt: target.startAt,
    endAt: newEndAt,
    hourlyRateCents: target.hourlyRateCents,
    discountCents: target.discountCents,
    commissionPerHourCents: target.commissionPerHourCents,
  });

  // prepayUsedCents 不重算:增加时长属于"老板送单",额外费用走现金,不再追扣预存
  const noteLines = [target.note, parsed.data.note].filter(Boolean);
  await db
    .update(order)
    .set({
      endAt: newEndAt,
      durationMin: newDurationMin,
      originalCents: computed.originalCents,
      payableCents: computed.payableCents,
      commissionCents: computed.commissionCents,
      playerEarnCents: computed.playerEarnCents,
      note: noteLines.join(" | ") || null,
    })
    .where(eq(order.id, target.id));

  logAudit({ actorId: me.id, actorName: me.name, action: "ADJUST_ORDER_DURATION", targetType: "order", targetId: target.id, detail: { playerName: target.playerName, oldMin: target.durationMin, newMin: newDurationMin } });
  invalidatePages(target.id);
  return { ok: true as const };
}

export async function adjustOrderRateAction(
  input: z.infer<typeof adjustRateSchema>
) {
  const { user: me } = await requireSession({ role: ["BOSS", "STAFF", "SERVICE"] });
  const parsed = adjustRateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.errors[0]?.message ?? "参数错误",
    };
  }

  const hourlyRateCents = yuanStringToCents(parsed.data.hourlyRateYuan);
  if (hourlyRateCents <= 0) {
    return { ok: false as const, error: "单价必须大于 0" };
  }
  if (hourlyRateCents > MAX_AMOUNT_CENTS) {
    return { ok: false as const, error: "单价超出上限" };
  }
  if (hourlyRateCents < DEFAULT_COMMISSION_PER_HOUR_CENTS) {
    return {
      ok: false as const,
      error: `单价不能低于抽成时薪(${DEFAULT_COMMISSION_PER_HOUR_CENTS / 100} 元/小时)`,
    };
  }

  const [target] = await db
    .select({
      id: order.id,
      orderStatus: order.orderStatus,
      settleStatus: order.settleStatus,
      startAt: order.startAt,
      durationMin: order.durationMin,
      hourlyRateCents: order.hourlyRateCents,
      commissionPerHourCents: order.commissionPerHourCents,
      originalCents: order.originalCents,
      discountCents: order.discountCents,
      payableCents: order.payableCents,
      prepayUsedCents: order.prepayUsedCents,
      playerEarnCents: order.playerEarnCents,
      playerName: user.name,
      customerName: customer.name,
    })
    .from(order)
    .innerJoin(user, eq(user.id, order.playerId))
    .innerJoin(customer, eq(customer.id, order.customerId))
    .where(eq(order.id, parsed.data.id))
    .limit(1);
  if (!target) return { ok: false as const, error: "订单不存在" };
  if (target.orderStatus === "CANCELED") {
    return { ok: false as const, error: "已取消的订单不能修改单价" };
  }
  if (target.settleStatus !== "UNSETTLED") {
    return { ok: false as const, error: "已结算的订单不能修改" };
  }
  if (target.prepayUsedCents > 0) {
    return { ok: false as const, error: "使用预存抵扣的订单不能修改单价" };
  }

  const endAt = new Date(
    target.startAt.getTime() + target.durationMin * 60000
  );
  const computed = computeOrder({
    startAt: target.startAt,
    endAt,
    hourlyRateCents,
    discountCents: target.discountCents,
    commissionPerHourCents: target.commissionPerHourCents,
  });
  if (computed.discountCents > computed.originalCents) {
    return { ok: false as const, error: "优惠不能超过原价" };
  }

  const result = await db
    .update(order)
    .set({
      hourlyRateCents,
      originalCents: computed.originalCents,
      payableCents: computed.payableCents,
      commissionCents: computed.commissionCents,
      playerEarnCents: computed.playerEarnCents,
    })
    .where(
      and(
        eq(order.id, target.id),
        eq(order.settleStatus, "UNSETTLED"),
        eq(order.orderStatus, target.orderStatus),
        eq(order.prepayUsedCents, 0)
      )
    );
  if (getAffectedRows(result) !== 1) {
    return { ok: false as const, error: "订单状态已变化,请刷新后重试" };
  }

  logAudit({
    actorId: me.id,
    actorName: me.name,
    action: "ADJUST_ORDER_RATE",
    targetType: "order",
    targetId: target.id,
    detail: {
      playerName: target.playerName,
      customerName: target.customerName,
      oldRateCents: target.hourlyRateCents,
      newRateCents: hourlyRateCents,
      oldPayableCents: target.payableCents,
      newPayableCents: computed.payableCents,
      oldPlayerEarnCents: target.playerEarnCents,
      newPlayerEarnCents: computed.playerEarnCents,
    },
  });
  invalidatePages(target.id);
  return { ok: true as const };
}

const cancelSchema = z.object({
  id: z.string(),
  fault: z.enum(["PLAYER", "CUSTOMER", "SHOP", "OTHER"]),
  note: z
    .string()
    .max(500)
    .optional()
    .nullable()
    .transform((s) => {
      const v = s?.trim();
      return v ? v : null;
    }),
  /** 给陪玩的补偿金额(元),默认 0 */
  compensationYuan: z.string().optional(),
});

export type CancelOrderInput = z.input<typeof cancelSchema>;

export async function cancelOrderAction(input: CancelOrderInput) {
  const { user: me } = await requireSession({ role: ["BOSS", "STAFF", "SERVICE"] });
  const parsed = cancelSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.errors[0]?.message ?? "参数错误",
    };
  }
  const { id, fault, note, compensationYuan } = parsed.data;

  const [target] = await db
    .select({
      orderStatus: order.orderStatus,
      settleStatus: order.settleStatus,
      playerEarnCents: order.playerEarnCents,
      customerId: order.customerId,
      prepayUsedCents: order.prepayUsedCents,
      customerName: customer.name,
      playerName: user.name,
    })
    .from(order)
    .innerJoin(customer, eq(customer.id, order.customerId))
    .innerJoin(user, eq(user.id, order.playerId))
    .where(eq(order.id, id))
    .limit(1);
  if (!target) return { ok: false as const, error: "订单不存在" };
  if (target.orderStatus === "CANCELED") {
    return { ok: false as const, error: "订单已取消" };
  }
  if (target.settleStatus !== "UNSETTLED") {
    return { ok: false as const, error: "已结算的订单不能取消" };
  }

  const compensationCents = compensationYuan
    ? Math.max(0, yuanStringToCents(compensationYuan))
    : 0;
  if (compensationCents > MAX_AMOUNT_CENTS) {
    return { ok: false as const, error: "补偿金额超出上限" };
  }
  if (compensationCents > target.playerEarnCents) {
    return { ok: false as const, error: "补偿不能超过原应得金额" };
  }

  // 补偿 = 0 时无需结算,直接 SETTLED;> 0 走待结算流程
  const now = new Date();
  const noCompensation = compensationCents === 0;

  try {
    await db.transaction(async (tx) => {
      const result = await tx
        .update(order)
        .set({
          orderStatus: "CANCELED",
          canceledAt: now,
          cancelFault: fault,
          cancelNote: note,
          playerCompensationCents: compensationCents,
          settleStatus: noCompensation ? "SETTLED" : "UNSETTLED",
          settledAt: noCompensation ? now : null,
          paidMethod: null,
        })
        .where(
          and(
            eq(order.id, id),
            eq(order.settleStatus, "UNSETTLED"),
            inArray(order.orderStatus, CANCELABLE_ORDER_STATUSES)
          )
        );
      if (getAffectedRows(result) !== 1) {
        throw new Error("ORDER_STATE_CHANGED");
      }

      if (target.prepayUsedCents > 0) {
        await tx
          .update(customer)
          .set({
            balanceCents: sql`${customer.balanceCents} + ${target.prepayUsedCents}`,
          })
          .where(eq(customer.id, target.customerId));
        await tx.insert(customerBalanceTxn).values({
          id: nanoid(),
          customerId: target.customerId,
          orderId: id,
          type: "ORDER_REFUND",
          amountCents: target.prepayUsedCents,
          note: "订单取消退回预存",
          createdById: me.id,
        });
      }
    });
  } catch (e) {
    if (e instanceof Error && e.message === "ORDER_STATE_CHANGED") {
      return { ok: false as const, error: "订单状态已变化,请刷新后重试" };
    }
    throw e;
  }
  invalidatePages(id);

  notifyOrderCanceled({
    actorName: me.name,
    customerName: target.customerName,
    fault,
    compensationCents,
  });
  logAudit({ actorId: me.id, actorName: me.name, action: "CANCEL_ORDER", targetType: "order", targetId: id, detail: { playerName: target.playerName, customerName: target.customerName, fault, compensationCents } });

  return { ok: true as const };
}

const settleSchema = z.object({
  id: z.string().min(1),
  paidMethod: z.enum(["WECHAT", "ALIPAY"]).optional(),
});

export async function settleOrderAction(input: z.input<typeof settleSchema>) {
  const { user: me } = await requireSession({ role: ["BOSS", "STAFF"] });
  const parsed = settleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.errors[0]?.message ?? "参数错误" };
  }
  const result = await db
    .update(order)
    .set({
      settleStatus: "SETTLED",
      settledAt: new Date(),
      paidMethod: parsed.data.paidMethod ?? null,
    })
    .where(
      and(
        eq(order.id, parsed.data.id),
        eq(order.settleStatus, "UNSETTLED"),
        settlableOrderCondition()
      )
    );
  if (getAffectedRows(result) !== 1) {
    const [current] = await db
      .select({
        orderStatus: order.orderStatus,
        settleStatus: order.settleStatus,
        playerCompensationCents: order.playerCompensationCents,
      })
      .from(order)
      .where(eq(order.id, parsed.data.id))
      .limit(1);
    if (!current) return { ok: false as const, error: "订单不存在" };
    if (current.settleStatus === "SETTLED") {
      return { ok: false as const, error: "已结算,请勿重复操作" };
    }
    if (
      current.orderStatus === "CANCELED" &&
      current.playerCompensationCents <= 0
    ) {
      return { ok: false as const, error: "取消订单无补偿,无需结算" };
    }
    return { ok: false as const, error: "订单尚未完成或取消,无法结算" };
  }

  const [target] = await db
    .select({
      orderStatus: order.orderStatus,
      playerEarnCents: order.playerEarnCents,
      playerCompensationCents: order.playerCompensationCents,
      playerName: user.name,
    })
    .from(order)
    .innerJoin(user, eq(user.id, order.playerId))
    .where(eq(order.id, parsed.data.id))
    .limit(1);
  if (!target) return { ok: false as const, error: "订单不存在" };
  invalidatePages(parsed.data.id);

  // 取消单结算时金额是补偿,完成单是应得
  const amount =
    target.orderStatus === "CANCELED"
      ? target.playerCompensationCents
      : target.playerEarnCents;
  notifyOrderSettled({
    actorName: me.name,
    playerEarnCents: amount,
    paidMethod: parsed.data.paidMethod,
  });
  logAudit({ actorId: me.id, actorName: me.name, action: "SETTLE_ORDER", targetType: "order", targetId: parsed.data.id, detail: { playerName: target.playerName, amount, paidMethod: parsed.data.paidMethod } });

  return { ok: true as const };
}

export async function unsettleOrderAction(input: { id: string }) {
  const { user: me } = await requireSession({ role: ["BOSS", "STAFF"] });
  const [info] = await db
    .select({ playerName: user.name, customerName: customer.name, playerEarnCents: order.playerEarnCents })
    .from(order)
    .innerJoin(user, eq(user.id, order.playerId))
    .innerJoin(customer, eq(customer.id, order.customerId))
    .where(eq(order.id, input.id))
    .limit(1);
  // 禁止撤销「已取消」单的结算:取消单的 SETTLED 是退款流程的终态,
  // 撤销会让预存退款与结算状态错位,且可能被重复结算。只允许撤销已完成单。
  const result = await db
    .update(order)
    .set({ settleStatus: "UNSETTLED", settledAt: null, paidMethod: null })
    .where(
      and(
        eq(order.id, input.id),
        eq(order.settleStatus, "SETTLED"),
        eq(order.orderStatus, "COMPLETED")
      )
    );
  if (getAffectedRows(result) !== 1) {
    return { ok: false as const, error: "只能撤销已完成订单的结算" };
  }
  logAudit({ actorId: me.id, actorName: me.name, action: "UNSETTLE_ORDER", targetType: "order", targetId: input.id, detail: info ? { playerName: info.playerName, customerName: info.customerName, amount: info.playerEarnCents } : undefined });
  invalidatePages(input.id);
  return { ok: true as const };
}

export async function batchSettleAction(input: {
  ids: string[];
  paidMethod?: "WECHAT" | "ALIPAY";
}) {
  const { user: me } = await requireSession({ role: ["BOSS", "STAFF"] });
  if (!input.ids.length) return { ok: false as const, error: "没有选中订单" };
  if (input.ids.length > 200) return { ok: false as const, error: "单次最多批量结算200单" };

  const uniqueIds = Array.from(new Set(input.ids));
  const now = new Date();

  const result = await db
    .update(order)
    .set({
      settleStatus: "SETTLED",
      settledAt: now,
      paidMethod: input.paidMethod ?? null,
    })
    .where(
      and(
        inArray(order.id, uniqueIds),
        eq(order.settleStatus, "UNSETTLED"),
        settlableOrderCondition()
      )
    );
  const settled = getAffectedRows(result);

  if (settled > 0) {
    logAudit({ actorId: me.id, actorName: me.name, action: "BATCH_SETTLE", targetType: "order", detail: { count: settled, paidMethod: input.paidMethod } });
    revalidatePath("/overview");
    revalidatePath("/orders");
    revalidatePath("/payouts");
    revalidatePath("/leaderboard");
    revalidatePath("/customers");
  }
  return { ok: true as const, count: settled };
}
