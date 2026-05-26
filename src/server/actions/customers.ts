"use server";

import { revalidatePath } from "next/cache";
import { aliasedTable, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { customer, customerBalanceTxn, order, user } from "@/db/schema";
import { requireSession } from "@/lib/auth-helpers";
import { yuanStringToCents } from "@/lib/format";
import { nanoid } from "../id";

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

const updateSchema = z.object({
  id: z.string(),
  name: z
    .string()
    .min(1, "客户名不能为空")
    .max(32)
    .transform((s) => s.trim())
    .refine((s) => s.length > 0, "客户名不能全为空格"),
  wechat: optionalTrimmed(64),
  note: optionalTrimmed(200),
});

const depositSchema = z.object({
  customerId: z.string(),
  amountYuan: z.string().min(1, "请填写充值金额"),
  note: optionalTrimmed(200),
});

export async function updateCustomerAction(input: z.infer<typeof updateSchema>) {
  await requireSession({ role: ["BOSS", "STAFF"] });
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.errors[0]?.message ?? "参数错误",
    };
  }
  const { id, name, wechat, note } = parsed.data;

  await db
    .update(customer)
    .set({ name, wechat, note })
    .where(eq(customer.id, id));

  revalidatePath("/customers");
  revalidatePath("/orders");
  return { ok: true as const };
}

export async function addCustomerDepositAction(
  input: z.infer<typeof depositSchema>
) {
  const { user: me } = await requireSession({ role: ["BOSS", "STAFF"] });
  const parsed = depositSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.errors[0]?.message ?? "参数错误",
    };
  }
  const { customerId, amountYuan, note } = parsed.data;
  const amountCents = yuanStringToCents(amountYuan);
  if (amountCents <= 0) {
    return { ok: false as const, error: "充值金额必须大于 0" };
  }

  const existing = await db
    .select({ id: customer.id })
    .from(customer)
    .where(eq(customer.id, customerId))
    .get();
  if (!existing) return { ok: false as const, error: "客户不存在" };

  db.transaction((tx) => {
    tx
      .update(customer)
      .set({ balanceCents: sql`${customer.balanceCents} + ${amountCents}` })
      .where(eq(customer.id, customerId))
      .run();

    tx.insert(customerBalanceTxn).values({
      id: nanoid(),
      customerId,
      type: "DEPOSIT",
      amountCents,
      note,
      createdById: me.id,
    }).run();
  });

  revalidatePath("/customers");
  revalidatePath("/orders/new");
  return { ok: true as const };
}

export async function getCustomerLedgerAction(input: {
  customerId: string;
}) {
  await requireSession({ role: ["BOSS", "STAFF"] });

  const playerUser = aliasedTable(user, "ledger_player");
  const dispatcherUser = aliasedTable(user, "ledger_dispatcher");

  const balanceRows = await db
    .select({
      id: customerBalanceTxn.id,
      type: customerBalanceTxn.type,
      amountCents: customerBalanceTxn.amountCents,
      note: customerBalanceTxn.note,
      createdAt: customerBalanceTxn.createdAt,
      actorName: user.name,
      orderId: order.id,
      orderStartAt: order.startAt,
      orderPayableCents: order.payableCents,
    })
    .from(customerBalanceTxn)
    .innerJoin(user, eq(user.id, customerBalanceTxn.createdById))
    .leftJoin(order, eq(order.id, customerBalanceTxn.orderId))
    .where(eq(customerBalanceTxn.customerId, input.customerId))
    .orderBy(desc(customerBalanceTxn.createdAt))
    .limit(100);

  const orderRows = await db
    .select({
      id: order.id,
      createdAt: order.createdAt,
      startAt: order.startAt,
      durationMin: order.durationMin,
      payableCents: order.payableCents,
      prepayUsedCents: order.prepayUsedCents,
      discountCents: order.discountCents,
      orderStatus: order.orderStatus,
      note: order.note,
      playerName: playerUser.name,
      dispatcherName: dispatcherUser.name,
    })
    .from(order)
    .innerJoin(playerUser, eq(playerUser.id, order.playerId))
    .innerJoin(dispatcherUser, eq(dispatcherUser.id, order.dispatcherId))
    .where(eq(order.customerId, input.customerId))
    .orderBy(desc(order.startAt))
    .limit(100);

  const rows = [
    ...orderRows.map((r) => ({
      kind: "ORDER" as const,
      id: `order:${r.id}`,
      orderId: r.id,
      createdAt: r.createdAt.toISOString(),
      occurredAt: r.startAt.toISOString(),
      startAt: r.startAt.toISOString(),
      durationMin: r.durationMin,
      payableCents: r.payableCents,
      prepayUsedCents: r.prepayUsedCents,
      discountCents: r.discountCents,
      orderStatus: r.orderStatus,
      note: r.note,
      playerName: r.playerName,
      dispatcherName: r.dispatcherName,
    })),
    ...balanceRows.map((r) => ({
      kind: "BALANCE" as const,
      id: `balance:${r.id}`,
      txnId: r.id,
      type: r.type,
      amountCents: r.amountCents,
      note: r.note,
      createdAt: r.createdAt.toISOString(),
      occurredAt: r.createdAt.toISOString(),
      actorName: r.actorName,
      orderId: r.orderId,
      orderStartAt: r.orderStartAt?.toISOString() ?? null,
      orderPayableCents: r.orderPayableCents,
    })),
  ]
    .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))
    .slice(0, 100);

  return {
    ok: true as const,
    rows,
  };
}

export async function getCustomerBalanceTxnsAction(input: {
  customerId: string;
}) {
  return getCustomerLedgerAction(input);
}
