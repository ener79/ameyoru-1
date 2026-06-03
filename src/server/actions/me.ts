"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { user } from "@/db/schema";
import { auth } from "@/lib/auth";
import { getOptionalSession, requireSession } from "@/lib/auth-helpers";

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
