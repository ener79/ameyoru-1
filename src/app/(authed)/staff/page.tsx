import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { playerInvite, user } from "@/db/schema";
import { requireSession } from "@/lib/auth-helpers";
import { PageHeader } from "@/components/page-header";
import { StaffClient } from "./staff-client";

export default async function StaffPage() {
  const { user: me } = await requireSession({ role: ["BOSS", "STAFF"] });

  const [staff, serviceUsers, invites] = await Promise.all([
    db
      .select({
        id: user.id,
        username: user.username,
        displayName: user.name,
        active: user.active,
        mustChangePwd: user.mustChangePwd,
        createdAt: user.createdAt,
      })
      .from(user)
      .where(eq(user.role, "STAFF"))
      .orderBy(desc(user.createdAt)),
    db
      .select({
        id: user.id,
        username: user.username,
        displayName: user.name,
        active: user.active,
        mustChangePwd: user.mustChangePwd,
        createdAt: user.createdAt,
      })
      .from(user)
      .where(eq(user.role, "SERVICE"))
      .orderBy(desc(user.createdAt)),
    db
      .select({
        id: playerInvite.id,
        inviteToken: playerInvite.inviteToken,
        playerGender: playerInvite.playerGender,
        defaultRateCents: playerInvite.defaultRateCents,
        maxUses: playerInvite.maxUses,
        useCount: playerInvite.useCount,
        expiresAt: playerInvite.expiresAt,
        createdAt: playerInvite.createdAt,
        createdByName: user.name,
      })
      .from(playerInvite)
      .innerJoin(user, eq(user.id, playerInvite.createdById))
      .orderBy(desc(playerInvite.createdAt))
      .limit(100),
  ]);

  const toRow = (s: typeof staff[number]) => ({
    id: s.id,
    username: s.username ?? "",
    displayName: s.displayName,
    active: s.active,
    mustChangePwd: s.mustChangePwd,
    createdAt: s.createdAt.toISOString(),
  });

  return (
    <>
      <PageHeader
        title="员工"
        description="管理店长账号 · 店长可派单、看订单、管理陪玩,但只有店主能创建/停用/删除店长"
      />
      <StaffClient
        isBoss={me.role === "BOSS"}
        staff={staff.map(toRow)}
        serviceUsers={serviceUsers.map(toRow)}
        invites={invites.map((i) => ({
          ...i,
          expiresAt: i.expiresAt.toISOString(),
          createdAt: i.createdAt.toISOString(),
        }))}
      />
    </>
  );
}
