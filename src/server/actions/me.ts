"use server";

import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { user } from "@/db/schema";
import { auth } from "@/lib/auth";
import { getOptionalSession } from "@/lib/auth-helpers";

const changeOwnPasswordSchema = z.object({
  currentPassword: z.string().min(1, "请输入当前密码"),
  newPassword: z.string().min(6, "新密码至少 6 位"),
});

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
