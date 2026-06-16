"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { giftTemplate, giftRecord } from "@/db/schema";
import { requireSession } from "@/lib/auth-helpers";
import { yuanStringToCents } from "@/lib/format";
import { MAX_AMOUNT_CENTS } from "@/lib/constants";
import { nanoid } from "../id";
import { logAudit } from "@/server/audit";

/* ----------------------------- schemas ----------------------------- */

const upsertSchema = z.object({
  id: z.string().optional(),
  name: z
    .string()
    .trim()
    .min(1, "请填写礼物名称")
    .max(100, "名称最多 100 个字符"),
  priceYuan: z.string(),
  sortOrder: z.number().int().optional(),
  active: z.boolean().optional(),
});

export type UpsertGiftTemplateInput = z.input<typeof upsertSchema>;

const deleteSchema = z.object({
  id: z.string().min(1),
});

/* ----------------------------- helpers ----------------------------- */

function invalidate() {
  revalidatePath("/gifts");
  revalidatePath("/my-gifts");
}

/* ----------------------------- actions ----------------------------- */

/**
 * 新增/编辑礼物模板。仅 BOSS 可操作。
 */
export async function upsertGiftTemplateAction(input: UpsertGiftTemplateInput) {
  const { user: me } = await requireSession({ role: "BOSS" });

  const parsed = upsertSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.errors[0]?.message ?? "参数错误" };
  }
  const d = parsed.data;

  const priceCents = yuanStringToCents(d.priceYuan);
  if (priceCents <= 0) {
    return { ok: false as const, error: "价格必须大于 0" };
  }
  if (priceCents > MAX_AMOUNT_CENTS) {
    return { ok: false as const, error: "价格超出上限" };
  }

  if (d.id) {
    // Update
    await db
      .update(giftTemplate)
      .set({
        name: d.name,
        priceCents,
        sortOrder: d.sortOrder ?? 0,
        active: d.active ?? true,
      })
      .where(eq(giftTemplate.id, d.id));

    logAudit({
      actorId: me.id,
      actorName: me.name,
      action: "UPDATE_GIFT_TEMPLATE",
      targetType: "gift_template",
      targetId: d.id,
      detail: { name: d.name, priceCents },
    });
  } else {
    // Create
    const id = nanoid();
    await db.insert(giftTemplate).values({
      id,
      name: d.name,
      priceCents,
      sortOrder: d.sortOrder ?? 0,
      active: true,
    });

    logAudit({
      actorId: me.id,
      actorName: me.name,
      action: "CREATE_GIFT_TEMPLATE",
      targetType: "gift_template",
      targetId: id,
      detail: { name: d.name, priceCents },
    });
  }

  invalidate();
  return { ok: true as const };
}

/**
 * 删除礼物模板。仅 BOSS 可操作。
 * - 如果有礼物记录引用此模板:软删除(active=false)
 * - 如果没有引用:硬删除
 */
export async function deleteGiftTemplateAction(input: { id: string }) {
  const { user: me } = await requireSession({ role: "BOSS" });

  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.errors[0]?.message ?? "参数错误" };
  }

  const [existing] = await db
    .select({ id: giftTemplate.id, name: giftTemplate.name })
    .from(giftTemplate)
    .where(eq(giftTemplate.id, parsed.data.id))
    .limit(1);
  if (!existing) {
    return { ok: false as const, error: "模板不存在" };
  }

  // Check if any gift_record references this template
  const [ref] = await db
    .select({ id: giftRecord.id })
    .from(giftRecord)
    .where(eq(giftRecord.giftTemplateId, parsed.data.id))
    .limit(1);

  if (ref) {
    // Soft delete
    await db
      .update(giftTemplate)
      .set({ active: false })
      .where(eq(giftTemplate.id, parsed.data.id));

    logAudit({
      actorId: me.id,
      actorName: me.name,
      action: "SOFT_DELETE_GIFT_TEMPLATE",
      targetType: "gift_template",
      targetId: parsed.data.id,
      detail: { name: existing.name, reason: "referenced by gift records" },
    });
  } else {
    // Hard delete
    await db
      .delete(giftTemplate)
      .where(eq(giftTemplate.id, parsed.data.id));

    logAudit({
      actorId: me.id,
      actorName: me.name,
      action: "DELETE_GIFT_TEMPLATE",
      targetType: "gift_template",
      targetId: parsed.data.id,
      detail: { name: existing.name },
    });
  }

  invalidate();
  return { ok: true as const };
}

/**
 * 列出所有启用中的礼物模板。所有角色都可调用。
 */
export async function listGiftTemplates() {
  await requireSession();

  return db
    .select({
      id: giftTemplate.id,
      name: giftTemplate.name,
      priceCents: giftTemplate.priceCents,
      sortOrder: giftTemplate.sortOrder,
    })
    .from(giftTemplate)
    .where(eq(giftTemplate.active, true))
    .orderBy(asc(giftTemplate.sortOrder), asc(giftTemplate.priceCents));
}

/**
 * 列出所有礼物模板(含停用)。仅 BOSS 可调用。
 */
export async function listAllGiftTemplates() {
  await requireSession({ role: "BOSS" });

  return db
    .select({
      id: giftTemplate.id,
      name: giftTemplate.name,
      priceCents: giftTemplate.priceCents,
      sortOrder: giftTemplate.sortOrder,
      active: giftTemplate.active,
      createdAt: giftTemplate.createdAt,
    })
    .from(giftTemplate)
    .orderBy(asc(giftTemplate.sortOrder), asc(giftTemplate.priceCents));
}
