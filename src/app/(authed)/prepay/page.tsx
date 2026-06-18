import { and, desc, gt, or, like } from "drizzle-orm";
import { db } from "@/db";
import { customer } from "@/db/schema";
import { requireSession } from "@/lib/auth-helpers";
import { PageHeader } from "@/components/page-header";
import { PrepayClient } from "./prepay-client";

export default async function PrepayPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { user: me } = await requireSession({
    role: ["BOSS", "STAFF", "SERVICE"],
  });
  const { q = "" } = await searchParams;
  const canManage = me.role === "BOSS" || me.role === "STAFF";

  const search = q
    ? or(like(customer.name, `%${q}%`), like(customer.memberNo, `%${q}%`))
    : undefined;

  const rows = await db
    .select({
      id: customer.id,
      name: customer.name,
      memberNo: customer.memberNo,
      balanceCents: customer.balanceCents,
    })
    .from(customer)
    .where(and(gt(customer.balanceCents, 0), search))
    .orderBy(desc(customer.balanceCents))
    .limit(200);

  return (
    <>
      <PageHeader title="预存管理" />
      <PrepayClient canManage={canManage} customers={rows} />
    </>
  );
}
