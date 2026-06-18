"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { customer, customerBalanceTxn, user } from "@/db/schema";
import { requireSession } from "@/lib/auth-helpers";
import { getAffectedRows } from "@/lib/db-utils";
import { MAX_AMOUNT_CENTS } from "@/lib/constants";
import { yuanStringToCents, formatYuan } from "@/lib/format";
import { nanoid } from "../id";
import { logAudit } from "../audit";

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

function revalidatePrepay() {
  revalidatePath("/prepay");
  revalidatePath("/customers");
  revalidatePath("/orders/new");
}

const deductSchema = z.object({
  customerId: z.string(),
  amountYuan: z.string().min(1, "请填写扣款金额"),
  note: optionalTrimmed(200),
});

export async function prepayDeductAction(
  input: z.infer<typeof deductSchema>
) {
  const { user: me } = await requireSession({
    role: ["BOSS", "STAFF", "SERVICE"],
  });
  const parsed = deductSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.errors[0]?.message ?? "参数错误",
    };
  }
  const { customerId, amountYuan, note } = parsed.data;
  const amountCents = yuanStringToCents(amountYuan);
  if (amountCents <= 0) {
    return { ok: false as const, error: "扣款金额必须大于 0" };
  }
  if (amountCents > MAX_AMOUNT_CENTS) {
    return { ok: false as const, error: "扣款金额超出上限" };
  }

  const [existing] = await db
    .select({ id: customer.id, name: customer.name })
    .from(customer)
    .where(eq(customer.id, customerId))
    .limit(1);
  if (!existing) return { ok: false as const, error: "客户不存在" };

  try {
    await db.transaction(async (tx) => {
      const result = await tx
        .update(customer)
        .set({
          balanceCents: sql`${customer.balanceCents} - ${amountCents}`,
        })
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
        id: nanoid(),
        customerId,
        type: "SERVICE_DEDUCT",
        amountCents: -amountCents,
        note,
        createdById: me.id,
      });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "INSUFFICIENT_BALANCE") {
      return { ok: false as const, error: "余额不足,请刷新后重试" };
    }
    throw e;
  }

  logAudit({
    actorId: me.id,
    actorName: me.name,
    action: "PREPAY_DEDUCT",
    targetType: "customer",
    targetId: customerId,
    detail: { customerName: existing.name, amountCents },
  });
  revalidatePrepay();
  return { ok: true as const };
}

const REVERSIBLE_TYPES = [
  "DEPOSIT",
  "MANUAL_DEDUCT",
  "SERVICE_DEDUCT",
] as const;

const reverseSchema = z.object({
  txnId: z.string(),
  note: optionalTrimmed(200),
});

export async function reverseTxnAction(
  input: z.infer<typeof reverseSchema>
) {
  const { user: me } = await requireSession({ role: ["BOSS", "STAFF"] });
  const parsed = reverseSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.errors[0]?.message ?? "参数错误",
    };
  }
  const { txnId, note } = parsed.data;

  const [original] = await db
    .select({
      id: customerBalanceTxn.id,
      customerId: customerBalanceTxn.customerId,
      type: customerBalanceTxn.type,
      amountCents: customerBalanceTxn.amountCents,
      note: customerBalanceTxn.note,
      customerName: customer.name,
    })
    .from(customerBalanceTxn)
    .innerJoin(customer, eq(customer.id, customerBalanceTxn.customerId))
    .where(eq(customerBalanceTxn.id, txnId))
    .limit(1);
  if (!original) return { ok: false as const, error: "交易不存在" };

  if (
    !(REVERSIBLE_TYPES as readonly string[]).includes(original.type)
  ) {
    return { ok: false as const, error: "该交易类型不支持回撤" };
  }

  const [alreadyReversed] = await db
    .select({ id: customerBalanceTxn.id })
    .from(customerBalanceTxn)
    .where(eq(customerBalanceTxn.reversedTxnId, txnId))
    .limit(1);
  if (alreadyReversed) {
    return { ok: false as const, error: "该交易已回撤,不可重复操作" };
  }

  const reversalAmountCents = -original.amountCents;

  try {
    await db.transaction(async (tx) => {
      if (reversalAmountCents < 0) {
        const result = await tx
          .update(customer)
          .set({
            balanceCents: sql`${customer.balanceCents} + ${reversalAmountCents}`,
          })
          .where(
            and(
              eq(customer.id, original.customerId),
              sql`${customer.balanceCents} >= ${Math.abs(reversalAmountCents)}`
            )
          );
        if (getAffectedRows(result) !== 1) {
          throw new Error("INSUFFICIENT_BALANCE");
        }
      } else {
        await tx
          .update(customer)
          .set({
            balanceCents: sql`${customer.balanceCents} + ${reversalAmountCents}`,
          })
          .where(eq(customer.id, original.customerId));
      }

      await tx.insert(customerBalanceTxn).values({
        id: nanoid(),
        customerId: original.customerId,
        type: "REVERSAL",
        amountCents: reversalAmountCents,
        reversedTxnId: txnId,
        note,
        createdById: me.id,
      });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "INSUFFICIENT_BALANCE") {
      return {
        ok: false as const,
        error: "客户余额不足以回撤该充值",
      };
    }
    throw e;
  }

  logAudit({
    actorId: me.id,
    actorName: me.name,
    action: "PREPAY_REVERSE",
    targetType: "customer",
    targetId: original.customerId,
    detail: {
      customerName: original.customerName,
      originalTxnId: txnId,
      originalType: original.type,
      reversalAmountCents,
    },
  });
  revalidatePrepay();
  return { ok: true as const };
}

export async function getPrepayLedgerAction(input: {
  customerId: string;
}) {
  await requireSession({ role: ["BOSS", "STAFF", "SERVICE"] });

  const rows = await db
    .select({
      id: customerBalanceTxn.id,
      type: customerBalanceTxn.type,
      amountCents: customerBalanceTxn.amountCents,
      reversedTxnId: customerBalanceTxn.reversedTxnId,
      note: customerBalanceTxn.note,
      createdAt: customerBalanceTxn.createdAt,
      actorName: user.name,
    })
    .from(customerBalanceTxn)
    .innerJoin(user, eq(user.id, customerBalanceTxn.createdById))
    .where(eq(customerBalanceTxn.customerId, input.customerId))
    .orderBy(desc(customerBalanceTxn.createdAt))
    .limit(200);

  const reversedSet = new Set(
    rows
      .filter((r) => r.type === "REVERSAL" && r.reversedTxnId)
      .map((r) => r.reversedTxnId!)
  );

  return {
    ok: true as const,
    rows: rows.map((r) => ({
      id: r.id,
      type: r.type,
      amountCents: r.amountCents,
      reversedTxnId: r.reversedTxnId,
      isReversed: reversedSet.has(r.id),
      note: r.note,
      createdAt: r.createdAt.toISOString(),
      actorName: r.actorName,
    })),
  };
}
