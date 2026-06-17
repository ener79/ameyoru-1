import { desc, eq, or, like, and } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema";
import { requireSession } from "@/lib/auth-helpers";
import { PageHeader } from "@/components/page-header";
import { PlayersClient } from "./players-client";

export default async function PlayersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { user: me } = await requireSession({ role: ["BOSS", "STAFF", "SERVICE"] });
  const { q = "" } = await searchParams;

  const conditions = [eq(user.role, "PLAYER")];
  if (q) {
    conditions.push(
      or(
        like(user.name, `%${q}%`),
        like(user.username, `%${q}%`)
      ) as ReturnType<typeof eq>
    );
  }

  const players = await db
    .select({
      id: user.id,
      username: user.username,
      displayName: user.name,
      active: user.active,
      playerGender: user.playerGender,
      defaultRateCents: user.defaultRateCents,
      mustChangePwd: user.mustChangePwd,
      wechatQrPath: user.wechatQrPath,
      alipayQrPath: user.alipayQrPath,
      qrSecurityCodeHash: user.qrSecurityCodeHash,
      depositPaid: user.depositPaid,
      createdAt: user.createdAt,
    })
    .from(user)
    .where(and(...conditions))
    .orderBy(desc(user.createdAt));

  return (
    <>
      <PageHeader
        title="陪玩"
        description={`${players.length} 位陪玩`}
      />
      <PlayersClient
        canManage={me.role === "BOSS" || me.role === "STAFF"}
        players={players.map((p) => ({
          id: p.id,
          username: p.username ?? "",
          displayName: p.displayName,
          active: p.active,
          playerGender: p.playerGender,
          defaultRateCents: p.defaultRateCents,
          mustChangePwd: p.mustChangePwd,
          wechatQrPath: p.wechatQrPath,
          alipayQrPath: p.alipayQrPath,
          hasQrSecurityCode: !!p.qrSecurityCodeHash,
          depositPaid: p.depositPaid,
          createdAt: p.createdAt.toISOString(),
        }))}
      />
    </>
  );
}
