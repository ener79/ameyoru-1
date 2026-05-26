"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { order, customer, customerBalanceTxn, user } from "@/db/schema";
import { requireSession } from "@/lib/auth-helpers";
import { computeOrder } from "@/lib/calc";
import { yuanStringToCents } from "@/lib/format";
import { DEFAULT_COMMISSION_PER_HOUR_CENTS } from "@/lib/constants";
import { generateMemberNo, nanoid } from "../id";
import {
  notifyOrderCreated,
  notifyOrderCompleted,
  notifyOrderSettled,
  notifyOrderCanceled,
} from "@/lib/wecom";

const optionalTrimmed = (max: number) =>
  z
    .string()
    .max(max)
    .optional()
    .nullable()
    .transform((s) => {
      const v = s?.trim();
      return v ? v : null;
    });

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
    .select({ id: user.id })
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

  // 陪玩自报:单价强制使用老板设的 defaultRateCents,忽略前端传值(防篡改)
  let hourlyRateCents: number;
  if (me.role === "PLAYER") {
    const [p] = await db
      .select({ defaultRateCents: user.defaultRateCents })
      .from(user)
      .where(eq(user.id, me.id))
      .limit(1);
    hourlyRateCents = p?.defaultRateCents ?? 0;
  } else {
    hourlyRateCents = yuanStringToCents(data.hourlyRateYuan);
  }
  if (hourlyRateCents <= 0) {
    return { ok: false as const, error: "单价必须大于 0" };
  }

  // 陪玩自报不允许填优惠
  const discountCents =
    me.role === "PLAYER" || !data.discountYuan
      ? 0
      : yuanStringToCents(data.discountYuan);

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
  const canUsePrepay = me.role !== "PLAYER" && !!data.usePrepay;
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

  return {
    ok: true as const,
    id,
    newCustomer: customerRec.isNew
      ? { name: customerRec.name, memberNo: customerRec.memberNo }
      : null,
  };
}

/**
 * 陪玩端"开始接单"快速建单:只填客户名,startAt=now,时长 / 金额初始化为 0。
 * 配合 endQuickOrderAction 使用,真实时长在结束时根据实际经过时间算出。
 */
export async function startQuickOrderAction(input: { customerName: string }) {
  const { user: me } = await requireSession({ role: "PLAYER" });

  const customerName = input.customerName?.trim();
  if (!customerName) {
    return { ok: false as const, error: "请填写客户名" };
  }

  const [player] = await db
    .select({ defaultRateCents: user.defaultRateCents })
    .from(user)
    .where(eq(user.id, me.id))
    .limit(1);
  const hourlyRateCents = player?.defaultRateCents ?? 0;
  if (hourlyRateCents <= 0) {
    return {
      ok: false as const,
      error: "请先在「个人设置」里填默认单价,或走「报单」走完整流程",
    };
  }

  // 同时只允许一个进行中的订单,避免开始按钮反复点出脏数据
  const [existing] = await db
    .select({ id: order.id })
    .from(order)
    .where(and(eq(order.playerId, me.id), eq(order.orderStatus, "IN_PROGRESS")))
    .limit(1);
  if (existing) {
    return {
      ok: false as const,
      error: "你已有进行中的订单,先结束再开始下一单",
    };
  }

  let customerRec: Awaited<ReturnType<typeof findOrCreateCustomer>>;
  try {
    customerRec = await findOrCreateCustomer({ name: customerName });
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "客户错误",
    };
  }

  const id = nanoid();
  const now = new Date();
  await db.insert(order).values({
    id,
    dispatcherId: me.id,
    playerId: me.id,
    customerId: customerRec.id,
    startAt: now,
    endAt: now,
    durationMin: 0,
    hourlyRateCents,
    commissionPerHourCents: DEFAULT_COMMISSION_PER_HOUR_CENTS,
    originalCents: 0,
    discountCents: 0,
    payableCents: 0,
    prepayUsedCents: 0,
    commissionCents: 0,
    playerEarnCents: 0,
    orderStatus: "IN_PROGRESS",
    settleStatus: "UNSETTLED",
  });

  invalidatePages(id);
  // 进行中阶段不推企微(金额还是 0),等 endQuickOrderAction 完成时再推完成通知
  return {
    ok: true as const,
    id,
    newCustomer: customerRec.isNew
      ? { name: customerRec.name, memberNo: customerRec.memberNo }
      : null,
  };
}

/**
 * 陪玩端"结束接单":根据 startAt 到 now 的实际经过时间重算时长 / 金额,
 * 把订单标记为 COMPLETED。
 */
export async function endQuickOrderAction(input: { id: string }) {
  const { user: me } = await requireSession({ role: "PLAYER" });

  const [target] = await db
    .select({
      id: order.id,
      playerId: order.playerId,
      orderStatus: order.orderStatus,
      startAt: order.startAt,
      hourlyRateCents: order.hourlyRateCents,
    })
    .from(order)
    .where(eq(order.id, input.id))
    .limit(1);
  if (!target) return { ok: false as const, error: "订单不存在" };
  if (target.playerId !== me.id) {
    return { ok: false as const, error: "无权操作" };
  }
  if (target.orderStatus !== "IN_PROGRESS") {
    return { ok: false as const, error: "订单已不是进行中状态" };
  }

  const now = new Date();
  const computed = computeOrder({
    startAt: target.startAt,
    endAt: now,
    hourlyRateCents: target.hourlyRateCents,
    discountCents: 0,
    commissionPerHourCents: DEFAULT_COMMISSION_PER_HOUR_CENTS,
  });
  if (computed.durationMin <= 0) {
    return {
      ok: false as const,
      error: "接单时长不足 1 分钟,如需取消请去订单详情",
    };
  }

  await db
    .update(order)
    .set({
      endAt: now,
      durationMin: computed.durationMin,
      originalCents: computed.originalCents,
      payableCents: computed.payableCents,
      commissionCents: computed.commissionCents,
      playerEarnCents: computed.playerEarnCents,
      orderStatus: "COMPLETED",
      completedAt: now,
    })
    .where(eq(order.id, target.id));

  invalidatePages(target.id);
  notifyOrderCompleted({
    actorName: me.name,
    payableCents: computed.payableCents,
    playerEarnCents: computed.playerEarnCents,
  });

  return { ok: true as const };
}

export async function completeOrderAction(input: { id: string }) {
  const { user: me } = await requireSession();
  const [target] = await db
    .select({
      playerId: order.playerId,
      orderStatus: order.orderStatus,
      payableCents: order.payableCents,
      playerEarnCents: order.playerEarnCents,
    })
    .from(order)
    .where(eq(order.id, input.id))
    .limit(1);
  if (!target) return { ok: false as const, error: "订单不存在" };
  if (target.orderStatus !== "IN_PROGRESS") {
    return { ok: false as const, error: "订单已不是进行中状态" };
  }
  if (me.role === "PLAYER" && target.playerId !== me.id) {
    return { ok: false as const, error: "无权操作" };
  }
  await db
    .update(order)
    .set({ orderStatus: "COMPLETED", completedAt: new Date() })
    .where(eq(order.id, input.id));
  invalidatePages(input.id);

  notifyOrderCompleted({
    actorName: me.name,
    payableCents: target.payableCents,
    playerEarnCents: target.playerEarnCents,
  });

  return { ok: true as const };
}

/**
 * 老板/店长:给已完成未结的订单增加时长(例如老板送单)。
 * 只在 COMPLETED + UNSETTLED 状态下可用。
 */
const adjustSchema = z.object({
  id: z.string(),
  extraMinutes: z.number().int().min(1, "至少增加 1 分钟"),
  note: z
    .string()
    .max(500)
    .optional()
    .transform((s) => s?.trim() || null),
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
    })
    .from(order)
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
  const { user: me } = await requireSession({ role: ["BOSS", "STAFF"] });
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
    })
    .from(order)
    .innerJoin(customer, eq(customer.id, order.customerId))
    .where(eq(order.id, id))
    .limit(1);
  if (!target) return { ok: false as const, error: "订单不存在" };
  if (target.orderStatus === "CANCELED") {
    return { ok: false as const, error: "订单已取消" };
  }

  const compensationCents = compensationYuan
    ? Math.max(0, yuanStringToCents(compensationYuan))
    : 0;
  if (compensationCents > target.playerEarnCents) {
    return { ok: false as const, error: "补偿不能超过原应得金额" };
  }

  // 补偿 = 0 时无需结算,直接 SETTLED;> 0 走待结算流程
  const now = new Date();
  const noCompensation = compensationCents === 0;

  await db.transaction(async (tx) => {
    await tx
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
      .where(eq(order.id, id));

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
  invalidatePages(id);

  notifyOrderCanceled({
    actorName: me.name,
    customerName: target.customerName,
    fault,
    compensationCents,
  });

  return { ok: true as const };
}

export async function settleOrderAction(input: {
  id: string;
  paidMethod?: "WECHAT" | "ALIPAY";
}) {
  const { user: me } = await requireSession({ role: ["BOSS", "STAFF"] });
  const [target] = await db
    .select({
      orderStatus: order.orderStatus,
      settleStatus: order.settleStatus,
      playerEarnCents: order.playerEarnCents,
      playerCompensationCents: order.playerCompensationCents,
    })
    .from(order)
    .where(eq(order.id, input.id))
    .limit(1);
  if (!target) return { ok: false as const, error: "订单不存在" };
  // 已完成 或 取消+有补偿 都可以结算
  const canSettle =
    target.orderStatus === "COMPLETED" || target.orderStatus === "CANCELED";
  if (!canSettle) {
    return { ok: false as const, error: "订单尚未完成或取消,无法结算" };
  }
  if (target.settleStatus === "SETTLED") {
    return { ok: false as const, error: "已结算,请勿重复操作" };
  }
  await db
    .update(order)
    .set({
      settleStatus: "SETTLED",
      settledAt: new Date(),
      paidMethod: input.paidMethod ?? null,
    })
    .where(eq(order.id, input.id));
  invalidatePages(input.id);

  // 取消单结算时金额是补偿,完成单是应得
  const amount =
    target.orderStatus === "CANCELED"
      ? target.playerCompensationCents
      : target.playerEarnCents;
  notifyOrderSettled({
    actorName: me.name,
    playerEarnCents: amount,
    paidMethod: input.paidMethod,
  });

  return { ok: true as const };
}

export async function unsettleOrderAction(input: { id: string }) {
  await requireSession({ role: ["BOSS", "STAFF"] });
  await db
    .update(order)
    .set({ settleStatus: "UNSETTLED", settledAt: null, paidMethod: null })
    .where(eq(order.id, input.id));
  invalidatePages(input.id);
  return { ok: true as const };
}
