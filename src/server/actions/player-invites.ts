"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { playerInvite } from "@/db/schema";
import { requireSession } from "@/lib/auth-helpers";
import { DEFAULT_PLAYER_RATE_CENTS } from "@/lib/constants";
import { yuanStringToCents } from "@/lib/format";
import { nanoid } from "../id";

const createSchema = z.object({
  playerGender: z.enum(["MALE", "FEMALE"]).optional(),
  defaultRateYuan: z.string().optional(),
  maxUses: z.number().int().min(0).optional(),
});

export async function createPlayerInviteAction(
  input: z.infer<typeof createSchema>
) {
  const { user: me } = await requireSession({ role: ["BOSS", "STAFF"] });
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.errors[0]?.message ?? "参数错误",
    };
  }

  const defaultRateCents = parsed.data.defaultRateYuan
    ? yuanStringToCents(parsed.data.defaultRateYuan)
    : DEFAULT_PLAYER_RATE_CENTS;
  if (defaultRateCents <= 0) {
    return { ok: false as const, error: "默认单价必须大于 0" };
  }

  const token = nanoid(32);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await db.insert(playerInvite).values({
    id: nanoid(),
    inviteToken: token,
    createdById: me.id,
    playerGender: parsed.data.playerGender ?? null,
    defaultRateCents,
    maxUses: parsed.data.maxUses ?? 1,
    expiresAt,
  });

  revalidatePath("/players");
  return { ok: true as const, token };
}
