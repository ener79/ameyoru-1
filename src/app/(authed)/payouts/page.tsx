import { and, count, desc, eq, gt, or } from "drizzle-orm";
import { db } from "@/db";
import { order, customer } from "@/db/schema";
import { requireSession } from "@/lib/auth-helpers";
import { playerSummary } from "@/server/stats";
import { PageHeader } from "@/components/page-header";
import { Pagination } from "@/components/pagination";
import { KpiCard } from "@/components/kpi-card";
import { formatYuan } from "@/lib/format";
import { PayoutsList } from "./payouts-list";

const PAGE_SIZE = 30;

export default async function PayoutsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { user: me } = await requireSession({ role: "PLAYER" });
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1") || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const payoutWhere = and(
    eq(order.playerId, me.id),
    or(
      eq(order.orderStatus, "COMPLETED"),
      and(
        eq(order.orderStatus, "CANCELED"),
        gt(order.playerCompensationCents, 0)
      )
    )
  );

  const [month, countResult, rows] = await Promise.all([
    playerSummary(me.id, "month"),
    db
      .select({ count: count() })
      .from(order)
      .innerJoin(customer, eq(customer.id, order.customerId))
      .where(payoutWhere),
    db
      .select({
        id: order.id,
        startAt: order.startAt,
        customerName: customer.name,
        durationMin: order.durationMin,
        playerEarnCents: order.playerEarnCents,
        playerCompensationCents: order.playerCompensationCents,
        orderStatus: order.orderStatus,
        settleStatus: order.settleStatus,
        paidMethod: order.paidMethod,
        settledAt: order.settledAt,
      })
      .from(order)
      .innerJoin(customer, eq(customer.id, order.customerId))
      .where(payoutWhere)
      .orderBy(desc(order.startAt))
      .limit(PAGE_SIZE)
      .offset(offset),
  ]);

  const total = countResult[0]?.count ?? 0;
  const settledThisMonth = month.playerEarnCents - month.pendingEarnCents;

  return (
    <>
      <PageHeader
        title="打款明细"
        description="已完成订单 + 取消有补偿的单"
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <KpiCard
          label="本月已打款"
          value={formatYuan(Math.max(settledThisMonth, 0))}
          hint={`本月共 ${month.orderCount} 单`}
        />
        <KpiCard
          label="本月待打款"
          value={formatYuan(month.pendingEarnCents)}
          emphasis
        />
        <KpiCard
          label="本月应得合计"
          value={formatYuan(month.playerEarnCents)}
        />
      </div>

      <div className="mt-6">
        <PayoutsList
          orders={rows.map((r) => ({
            ...r,
            startAt: r.startAt.toISOString(),
            settledAt: r.settledAt?.toISOString() ?? null,
          }))}
        />
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          baseHref="/payouts"
        />
      </div>
    </>
  );
}
