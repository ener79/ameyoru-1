"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { user } from "@/db/schema";
import { auth } from "@/lib/auth";
import { getOptionalSession, requireSession } from "@/lib/auth-helpers";
import { qrSecurityCodeSchema } from "@/lib/qr-security";

const changeOwnPasswordSchema = z.object({
  currentPassword: z.string().min(1, "请输入当前密码"),
  newPassword: z
    .string()
    .min(9, "密码必须超过 8 位")
    .regex(/(?=.*[a-z])(?=.*[A-Z])/, "密码必须包含大小写字母"),
});

const updateProfileSchema = z.object({
  name: z
    .string()
    .min(1, "请填写显示名")
    .max(32)
    .transform((s) => s.trim())
    .refine((s) => s.length > 0, "显示名不能全为空格"),
  username: z
    .string()
    .min(2, "用户名至少 2 位")
    .max(32)
    .regex(/^[\p{L}\p{N}_.-]+$/u, "用户名只能中文/字母/数字/下划线/点/横线"),
});

const changeOwnQrSecurityCodeSchema = z.object({
  currentSecurityCode: z.string().optional(),
  newSecurityCode: qrSecurityCodeSchema,
});

export async function updateOwnProfileAction(
  input: z.infer<typeof updateProfileSchema>
) {
  const { user: me } = await requireSession();
  const parsed = updateProfileSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.errors[0]?.message ?? "参数错误",
    };
  }

  const { name, username } = parsed.data;

  if (username !== me.username) {
    const [dup] = await db
      .select({ id: user.id })
      .from(user)
      .where(and(eq(user.username, username), ne(user.id, me.id)))
      .limit(1);
    if (dup) return { ok: false as const, error: "用户名已被占用" };
  }

  await db
    .update(user)
    .set({ name, username, displayUsername: username })
    .where(eq(user.id, me.id));

  revalidatePath("/profile");
  revalidatePath("/leaderboard");
  revalidatePath("/orders");
  revalidatePath("/gifts");
  return { ok: true as const };
}

export async function changeOwnPasswordAction(
  input: z.infer<typeof changeOwnPasswordSchema>
) {
  const session = await getOptionalSession();
  if (!session?.user?.id) {
    return { ok: false as const, error: "请先登录" };
  }

  const parsed = changeOwnPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.errors[0]?.message ?? "参数错误",
    };
  }

  try {
    await auth.api.changePassword({
      headers: await headers(),
      body: {
        currentPassword: parsed.data.currentPassword,
        newPassword: parsed.data.newPassword,
        revokeOtherSessions: true,
      },
    });
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "改密失败",
    };
  }

  await db
    .update(user)
    .set({ mustChangePwd: false })
    .where(eq(user.id, session.user.id));
  return { ok: true as const };
}

export async function changeOwnQrSecurityCodeAction(
  input: z.infer<typeof changeOwnQrSecurityCodeSchema>
) {
  const { user: me } = await requireSession({ role: "PLAYER" });
  const parsed = changeOwnQrSecurityCodeSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.errors[0]?.message ?? "参数错误",
    };
  }

  const [row] = await db
    .select({ qrSecurityCodeHash: user.qrSecurityCodeHash })
    .from(user)
    .where(eq(user.id, me.id))
    .limit(1);
  if (!row) return { ok: false as const, error: "账号不存在" };

  const ctx = await auth.$context;
  if (row.qrSecurityCodeHash) {
    const currentSecurityCode = parsed.data.currentSecurityCode?.trim();
    if (!currentSecurityCode) {
      return { ok: false as const, error: "请输入当前安全码" };
    }

    const verified = await ctx.password.verify({
      hash: row.qrSecurityCodeHash,
      password: currentSecurityCode,
    });
    if (!verified) {
      return { ok: false as const, error: "当前安全码错误" };
    }
  }

  const hash = await ctx.password.hash(parsed.data.newSecurityCode);
  await db
    .update(user)
    .set({ qrSecurityCodeHash: hash })
    .where(eq(user.id, me.id));

  revalidatePath("/profile");
  return { ok: true as const };
}
