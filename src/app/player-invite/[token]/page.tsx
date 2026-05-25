import { eq } from "drizzle-orm";
import { db } from "@/db";
import { playerInvite } from "@/db/schema";
import { PlayerInviteForm } from "./player-invite-form";

export default async function PlayerInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invite = await db
    .select({
      token: playerInvite.inviteToken,
      playerGender: playerInvite.playerGender,
      defaultRateCents: playerInvite.defaultRateCents,
      expiresAt: playerInvite.expiresAt,
      usedAt: playerInvite.usedAt,
      maxUses: playerInvite.maxUses,
      useCount: playerInvite.useCount,
    })
    .from(playerInvite)
    .where(eq(playerInvite.inviteToken, token))
    .get();

  const invalid =
    !invite || (invite.maxUses > 0 && invite.useCount >= invite.maxUses) || invite.expiresAt.getTime() < Date.now();

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-4">
      <div className="w-full max-w-lg space-y-6">
        <div className="space-y-2 text-center">
          <div className="mx-auto flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground text-base font-bold shadow-sm">
            起
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">陪玩开户</h1>
          <p className="text-sm text-muted-foreground">
            设置账号信息和收款码,保存后可直接登录
          </p>
        </div>

        {invalid ? (
          <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
            链接不存在、已过期或已使用
          </div>
        ) : (
          <PlayerInviteForm
            token={invite.token}
            initialGender={invite.playerGender ?? "FEMALE"}
            initialRateCents={invite.defaultRateCents ?? 4000}
          />
        )}
      </div>
    </div>
  );
}
