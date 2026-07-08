"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne, sql, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { order, customer, customerBalanceTxn, user } from "@/db/schema";
import { requireSession } from "@/lib/auth-helpers";
import { computeOrder } from "@/lib/calc";
import { yuanStringToCents } from "@/lib/format";
import { DEFAULT_COMMISSION_PER_HOUR_CENTS } from "@/lib/constants";
import { generateMemberNo, nanoid } from "../id";
import { logAudit } from "../audit";
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
  hourlyRateYuan: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, "单价格式不正确"),
  discountYuan: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, "优惠格式不正确")
    .optional(),
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
  logAudit({ actorId: me.id, actorName: me.name, action: "CREATE_ORDER", targetType: "order", targetId: id, detail: { customerName: customerRec.name, playerName: selectedPlayer.name, durationMin: computed.durationMin, payableCents: computed.payableCents, playerEarnCents: computed.playerEarnCents } });

  return {
    ok: true as const,
    id,
    newCustomer: customerRec.isNew
      ? { name: customerRec.name, memberNo: customerRec.memberNo }
      : null,
  };
}

export async function completeOrderAction(input: { id: string }) {
  const { user: me } = await requireSession({ role: ["BOSS", "STAFF"] });
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
  logAudit({ actorId: me.id, actorName: me.name, action: "COMPLETE_ORDER", targetType: "order", targetId: input.id });

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

  logAudit({ actorId: me.id, actorName: me.name, action: "ADJUST_ORDER_DURATION", targetType: "order", targetId: target.id, detail: { extraMinutes: parsed.data.extraMinutes } });
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
  compensationYuan: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, "补偿金额格式不正确")
    .optional(),
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

  const requestedCompensationCents = compensationYuan
    ? Math.max(0, yuanStringToCents(compensationYuan))
    : 0;
  // M2: 取消前已结算(已打款)的订单,取消后保持 SETTLED,不重开结算(避免二次打款)
  const wasSettled = target.settleStatus === "SETTLED";
  if (wasSettled && requestedCompensationCents > 0) {
    return { ok: false as const, error: "已付款订单取消后不会重新打款,补偿请填 0" };
  }
  const compensationCents = wasSettled ? 0 : requestedCompensationCents;
  if (compensationCents > target.playerEarnCents) {
    return { ok: false as const, error: "补偿不能超过原应得金额" };
  }

  // 补偿 = 0 时无需结算,直接 SETTLED;> 0 走待结算流程
  const now = new Date();
  const noCompensation = compensationCents === 0;

  let canceled = false;
  await db.transaction(async (tx) => {
    // H2: 守卫 orderStatus<>'CANCELED',保证并发双重取消时只有一方真正改动行,
    // 退款与退存流水也只在真正改动行时执行一次
    const [res] = await tx
      .update(order)
      .set({
        orderStatus: "CANCELED",
        canceledAt: now,
        cancelFault: fault,
        cancelNote: note,
        playerCompensationCents: compensationCents,
        prepayUsedCents: 0,
        // wasSettled 时保留原有结算状态/时间/支付方式,不重开结算
        ...(wasSettled
          ? {}
          : {
              settleStatus: noCompensation ? "SETTLED" : "UNSETTLED",
              settledAt: noCompensation ? now : null,
              paidMethod: null,
            }),
      })
      .where(and(eq(order.id, id), ne(order.orderStatus, "CANCELED")));
    if (res.affectedRows === 0) return; // 并发下已被取消,跳过退款与副作用
    canceled = true;

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
  if (!canceled) {
    return { ok: false as const, error: "订单已取消" };
  }
  invalidatePages(id);

  notifyOrderCanceled({
    actorName: me.name,
    customerName: target.customerName,
    fault,
    compensationCents,
  });
  logAudit({ actorId: me.id, actorName: me.name, action: "CANCEL_ORDER", targetType: "order", targetId: id, detail: { fault, compensationCents } });

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
  // 原子守卫:仅当仍为 UNSETTLED 时结算,避免读后写竞态导致重复打款/重复通知
  const [res] = await db
    .update(order)
    .set({
      settleStatus: "SETTLED",
      settledAt: new Date(),
      paidMethod: input.paidMethod ?? null,
    })
    .where(and(eq(order.id, input.id), eq(order.settleStatus, "UNSETTLED")));
  if (res.affectedRows === 0) {
    return { ok: false as const, error: "已结算,请勿重复操作" };
  }
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
  logAudit({ actorId: me.id, actorName: me.name, action: "SETTLE_ORDER", targetType: "order", targetId: input.id, detail: { amount, paidMethod: input.paidMethod } });

  return { ok: true as const };
}

export async function unsettleOrderAction(input: { id: string }) {
  const { user: me } = await requireSession({ role: ["BOSS", "STAFF"] });
  // 原子守卫:仅当当前确为 SETTLED 时才回退,幂等且防并发重复操作
  const [res] = await db
    .update(order)
    .set({ settleStatus: "UNSETTLED", settledAt: null, paidMethod: null })
    .where(and(eq(order.id, input.id), eq(order.settleStatus, "SETTLED")));
  if (res.affectedRows === 0) {
    return { ok: false as const, error: "订单未结算或不存在,无法撤销结算" };
  }
  logAudit({ actorId: me.id, actorName: me.name, action: "UNSETTLE_ORDER", targetType: "order", targetId: input.id });
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

  const now = new Date();
  let settled = 0;

  await db.transaction(async (tx) => {
    // 批量查询所有目标订单
    const targets = await tx
      .select({ id: order.id, orderStatus: order.orderStatus, settleStatus: order.settleStatus })
      .from(order)
      .where(inArray(order.id, input.ids));

    // 筛选可结算的
    const eligibleIds = targets
      .filter((t) => t.settleStatus === "UNSETTLED" && (t.orderStatus === "COMPLETED" || t.orderStatus === "CANCELED"))
      .map((t) => t.id);

    if (eligibleIds.length > 0) {
      // 原子守卫:再带上 settleStatus='UNSETTLED' 条件,只结算仍未结算的行,
      // 用 affectedRows 统计真正改动的行数,避免并发重复结算被重复计数
      const [res] = await tx
        .update(order)
        .set({ settleStatus: "SETTLED", settledAt: now, paidMethod: input.paidMethod ?? null })
        .where(and(inArray(order.id, eligibleIds), eq(order.settleStatus, "UNSETTLED")));
      settled = res.affectedRows;
    }
  });

  if (settled > 0) {
    logAudit({ actorId: me.id, actorName: me.name, action: "BATCH_SETTLE", targetType: "order", detail: { count: settled, paidMethod: input.paidMethod } });
  }

  invalidatePages();
  return { ok: true as const, count: settled };
}
