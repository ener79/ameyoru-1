"use server";

import { revalidatePath } from "next/cache";
import { aliasedTable, and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  customer,
  customerBalanceTxn,
  customerBalanceTxnPlayer,
  order,
  user,
} from "@/db/schema";
import { requireSession } from "@/lib/auth-helpers";
import { getAffectedRows } from "@/lib/db-utils";
import { customerSummary } from "@/server/stats";
import { formatYuan, yuanStringToCents } from "@/lib/format";
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

const deductSchema = z.object({
  customerId: z.string(),
  amountYuan: z.string().min(1, "请填写扣减金额"),
  playerIds: z.array(z.string()).min(1, "请至少选一个陪玩"),
  note: optionalTrimmed(200),
});

const mergeSchema = z.object({
  primaryId: z.string(),
  mergeIds: z.array(z.string()).min(1, "请选择至少一个客户合并"),
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

  const [existing] = await db
    .select({ id: customer.id })
    .from(customer)
    .where(eq(customer.id, customerId))
    .limit(1);
  if (!existing) return { ok: false as const, error: "客户不存在" };

  await db.transaction(async (tx) => {
    await tx
      .update(customer)
      .set({ balanceCents: sql`${customer.balanceCents} + ${amountCents}` })
      .where(eq(customer.id, customerId));

    await tx.insert(customerBalanceTxn).values({
      id: nanoid(),
      customerId,
      type: "DEPOSIT",
      amountCents,
      note,
      createdById: me.id,
    });
  });

  revalidatePath("/customers");
  revalidatePath("/orders/new");
  return { ok: true as const };
}

export async function deductCustomerBalanceAction(
  input: z.infer<typeof deductSchema>
) {
  const { user: me } = await requireSession({ role: ["BOSS", "STAFF"] });
  const parsed = deductSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.errors[0]?.message ?? "参数错误",
    };
  }
  const { customerId, amountYuan, playerIds, note } = parsed.data;
  const amountCents = yuanStringToCents(amountYuan);
  if (amountCents <= 0) {
    return { ok: false as const, error: "扣减金额必须大于 0" };
  }

  const uniquePlayerIds = Array.from(new Set(playerIds));
  const players = await db
    .select({ id: user.id })
    .from(user)
    .where(
      and(
        inArray(user.id, uniquePlayerIds),
        eq(user.role, "PLAYER"),
        eq(user.active, true)
      )
    );
  if (players.length !== uniquePlayerIds.length) {
    return { ok: false as const, error: "存在无效或已停用的陪玩" };
  }

  const [existing] = await db
    .select({ id: customer.id })
    .from(customer)
    .where(eq(customer.id, customerId))
    .limit(1);
  if (!existing) return { ok: false as const, error: "客户不存在" };

  const txnId = nanoid();
  try {
    await db.transaction(async (tx) => {
      const result = await tx
        .update(customer)
        .set({ balanceCents: sql`${customer.balanceCents} - ${amountCents}` })
        .where(
          and(
            eq(customer.id, customerId),
            sql`${customer.balanceCents} >= ${amountCents}`
          )
        );
      if (getAffectedRows(result) !== 1) {
        throw new Error("INSUFFICIENT_BALANCE");
      }

    await tx.insert(customerBalanceTxn).values({
      id: txnId,
      customerId,
      type: "MANUAL_DEDUCT",
      amountCents: -amountCents,
      note,
      createdById: me.id,
    });

    await tx.insert(customerBalanceTxnPlayer).values(
      uniquePlayerIds.map((playerId) => ({
        id: nanoid(),
        txnId,
        playerId,
      }))
    );
    });
  } catch (e) {
    if (e instanceof Error && e.message === "INSUFFICIENT_BALANCE") {
      return { ok: false as const, error: "余额不足,请刷新后重试" };
    }
    throw e;
  }

  revalidatePath("/customers");
  revalidatePath("/orders/new");
  return { ok: true as const };
}

export async function mergeCustomersAction(input: z.infer<typeof mergeSchema>) {
  await requireSession({ role: ["BOSS", "STAFF"] });
  const parsed = mergeSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.errors[0]?.message ?? "参数错误",
    };
  }
  const { primaryId, mergeIds } = parsed.data;
  const uniqueMergeIds = Array.from(new Set(mergeIds));
  if (uniqueMergeIds.includes(primaryId)) {
    return { ok: false as const, error: "不能把客户合并到自己" };
  }

  const allIds = [primaryId, ...uniqueMergeIds];
  const found = await db
    .select({ id: customer.id, balanceCents: customer.balanceCents })
    .from(customer)
    .where(inArray(customer.id, allIds));
  if (found.length !== allIds.length) {
    return { ok: false as const, error: "客户不存在或已被删除" };
  }

  const mergeBalance = found
    .filter((c) => uniqueMergeIds.includes(c.id))
    .reduce((sum, c) => sum + c.balanceCents, 0);

  await db.transaction(async (tx) => {
    await tx
      .update(order)
      .set({ customerId: primaryId })
      .where(inArray(order.customerId, uniqueMergeIds));

    await tx
      .update(customerBalanceTxn)
      .set({ customerId: primaryId })
      .where(inArray(customerBalanceTxn.customerId, uniqueMergeIds));

    if (mergeBalance !== 0) {
      await tx
        .update(customer)
        .set({
          balanceCents: sql`${customer.balanceCents} + ${mergeBalance}`,
        })
        .where(eq(customer.id, primaryId));
    }

    await tx.delete(customer).where(inArray(customer.id, uniqueMergeIds));
  });

  revalidatePath("/customers");
  revalidatePath("/orders");
  return { ok: true as const, mergedCount: uniqueMergeIds.length };
}

export async function deleteCustomerAction(input: { id: string }) {
  await requireSession({ role: ["BOSS", "STAFF"] });

  const [orderRef] = await db
    .select({ id: order.id })
    .from(order)
    .where(eq(order.customerId, input.id))
    .limit(1);
  if (orderRef) {
    return {
      ok: false as const,
      error: "客户有订单,不能删除。如有重复请用合并。",
    };
  }

  const [txnRef] = await db
    .select({ id: customerBalanceTxn.id })
    .from(customerBalanceTxn)
    .where(eq(customerBalanceTxn.customerId, input.id))
    .limit(1);
  if (txnRef) {
    return {
      ok: false as const,
      error: "客户有充值/扣减流水,不能删除。如有重复请用合并。",
    };
  }

  await db.delete(customer).where(eq(customer.id, input.id));

  revalidatePath("/customers");
  return { ok: true as const };
}

export async function listActivePlayersAction() {
  await requireSession({ role: ["BOSS", "STAFF"] });
  const rows = await db
    .select({ id: user.id, name: user.name, username: user.username })
    .from(user)
    .where(and(eq(user.role, "PLAYER"), eq(user.active, true)))
    .orderBy(asc(user.name));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    username: r.username ?? "",
  }));
}

export async function searchCustomersAction(input: { q?: string }) {
  await requireSession({ role: ["BOSS", "STAFF"] });
  return customerSummary({ q: input.q?.trim() || undefined, limit: 50 });
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

  // 拉手动扣减关联的陪玩名单
  const manualDeductTxnIds = balanceRows
    .filter((r) => r.type === "MANUAL_DEDUCT")
    .map((r) => r.id);
  const playerByTxn = new Map<string, string[]>();
  if (manualDeductTxnIds.length > 0) {
    const playerRows = await db
      .select({
        txnId: customerBalanceTxnPlayer.txnId,
        playerName: user.name,
      })
      .from(customerBalanceTxnPlayer)
      .innerJoin(user, eq(user.id, customerBalanceTxnPlayer.playerId))
      .where(inArray(customerBalanceTxnPlayer.txnId, manualDeductTxnIds));
    for (const row of playerRows) {
      const arr = playerByTxn.get(row.txnId) ?? [];
      arr.push(row.playerName);
      playerByTxn.set(row.txnId, arr);
    }
  }

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
      playerNames: playerByTxn.get(r.id) ?? null,
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
