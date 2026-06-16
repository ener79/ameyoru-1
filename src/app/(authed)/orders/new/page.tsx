import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { customer, user } from "@/db/schema";
import { requireSession } from "@/lib/auth-helpers";
import { PageHeader } from "@/components/page-header";
import { OrderForm } from "./order-form";
import type { PlayerGender } from "@/db/schema";

export default async function NewOrderPage() {
  const { user: me } = await requireSession();
  const isManager = me.role === "BOSS" || me.role === "STAFF" || me.role === "SERVICE";
  const canDiscount = me.role === "BOSS" || me.role === "STAFF";

  let players: {
    id: string;
    displayName: string;
    playerGender: PlayerGender | null;
    defaultRateCents: number | null;
  }[] = [];

  if (me.role === "PLAYER") {
    const [row] = await db
      .select({
        id: user.id,
        displayName: user.name,
        playerGender: user.playerGender,
        defaultRateCents: user.defaultRateCents,
      })
      .from(user)
      .where(eq(user.id, me.id))
      .limit(1);
    players = row ? [row] : [];
  } else {
    const rows = await db
      .select({
        id: user.id,
        displayName: user.name,
        playerGender: user.playerGender,
        defaultRateCents: user.defaultRateCents,
      })
      .from(user)
      .where(and(eq(user.role, "PLAYER"), eq(user.active, true)));
    players = rows;
  }

  const recentCustomers = await db
    .select({
      id: customer.id,
      name: customer.name,
      wechat: customer.wechat,
      memberNo: customer.memberNo,
      balanceCents: customer.balanceCents,
    })
    .from(customer)
    .orderBy(desc(customer.createdAt))
    .limit(20);

  return (
    <>
      <PageHeader
        title={isManager ? "派单" : "报单"}
        description={
          isManager
            ? "为陪玩派一个新单子,提交后状态为「进行中」"
            : "登记一单陪玩,实时计算应得"
        }
      />
      <OrderForm
        isManager={isManager}
        canDiscount={canDiscount}
        players={players}
        recentCustomers={recentCustomers}
      />
    </>
  );
}
