import Link from "next/link";
import { desc, eq, aliasedTable, sql, and, gte, lte, count, like, or } from "drizzle-orm";
import { Plus } from "lucide-react";
import { db } from "@/db";
import { order, user, customer } from "@/db/schema";
import { requireSession } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { OrdersList } from "./orders-list";
import { Pagination } from "@/components/pagination";
import { OrdersFilterBar } from "./orders-filter-bar";

const PAGE_SIZE = 50;

function escapeLike(s: string) {
  return s.replace(/[%_\\]/g, "\\$&");
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    id?: string;
    q?: string;
    tab?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: string;
  }>;
}) {
  const { user: me } = await requireSession();
  const params = await searchParams;
  const initialOpenId = params.id ?? null;
  const isManager = me.role === "BOSS" || me.role === "STAFF" || me.role === "SERVICE";

  const q = params.q?.trim() ?? "";
  const tab = params.tab ?? "PENDING_SETTLE";
  const dateFrom = params.dateFrom ?? "";
  const dateTo = params.dateTo ?? "";
  const page = Math.max(1, parseInt(params.page ?? "1") || 1);

  const dispatcherUser = aliasedTable(user, "dispatcher");

  const conditions: ReturnType<typeof eq>[] = [];

  // Player can only see their own orders
  if (me.role === "PLAYER") {
    conditions.push(eq(order.playerId, me.id));
  }

  // Tab filter (server-side)
  if (tab === "IN_PROGRESS") {
    conditions.push(eq(order.orderStatus, "IN_PROGRESS"));
  } else if (tab === "PENDING_SETTLE") {
    conditions.push(eq(order.settleStatus, "UNSETTLED"));
    // Only COMPLETED or CANCELED orders can be pending settlement
    // We filter with two conditions: not IN_PROGRESS basically
    // Use a raw SQL condition to avoid type issues with or()
    conditions.push(sql`(${order.orderStatus} = 'COMPLETED' OR ${order.orderStatus} = 'CANCELED')` as ReturnType<typeof eq>);
  } else if (tab === "SETTLED") {
    conditions.push(eq(order.settleStatus, "SETTLED"));
  }
  // "all" = no extra filter

  // Date range filter
  if (dateFrom) {
    conditions.push(gte(order.startAt, new Date(dateFrom)));
  }
  if (dateTo) {
    const toDate = new Date(dateTo);
    toDate.setHours(23, 59, 59, 999);
    conditions.push(lte(order.startAt, toDate));
  }

  // Search (needs join context — filter after join via subquery approach)
  // We'll use the full query with search applied via customer name / player name

  // For counting total (with search)
  const selectFields = {
    id: order.id,
    playerId: order.playerId,
    playerName: user.name,
    playerWechatQrPath: isManager
      ? user.wechatQrPath
      : sql<string | null>`NULL`.as("player_wechat_qr"),
    playerAlipayQrPath: isManager
      ? user.alipayQrPath
      : sql<string | null>`NULL`.as("player_alipay_qr"),
    dispatcherId: order.dispatcherId,
    dispatcherName: dispatcherUser.name,
    customerName: customer.name,
    customerMemberNo: customer.memberNo,
    customerWechat: isManager
      ? customer.wechat
      : sql<string | null>`NULL`.as("customer_wechat"),
    startAt: order.startAt,
    durationMin: order.durationMin,
    hourlyRateCents: order.hourlyRateCents,
    originalCents: order.originalCents,
    discountCents: order.discountCents,
    payableCents: order.payableCents,
    prepayUsedCents: order.prepayUsedCents,
    commissionCents: order.commissionCents,
    playerEarnCents: order.playerEarnCents,
    orderStatus: order.orderStatus,
    settleStatus: order.settleStatus,
    completedAt: order.completedAt,
    canceledAt: order.canceledAt,
    settledAt: order.settledAt,
    paidMethod: order.paidMethod,
    collectorName: order.collectorName,
    note: order.note,
    cancelFault: order.cancelFault,
    cancelNote: order.cancelNote,
    playerCompensationCents: order.playerCompensationCents,
    depositPaid: user.depositPaid,
  };



  // Search condition (SQL-level LIKE, not memory filter)
  if (q) {
    const escaped = escapeLike(q);
    conditions.push(
      or(
        like(customer.name, `%${escaped}%`),
        like(user.name, `%${escaped}%`),
        like(customer.memberNo, `%${escaped}%`)
      )!
    );
  }

  const finalWhere = conditions.length > 0 ? and(...conditions) : undefined;

  const offset = (page - 1) * PAGE_SIZE;

  // Count query
  const [countResult] = await db
    .select({ count: count() })
    .from(order)
    .innerJoin(user, eq(user.id, order.playerId))
    .innerJoin(dispatcherUser, eq(dispatcherUser.id, order.dispatcherId))
    .innerJoin(customer, eq(customer.id, order.customerId))
    .where(finalWhere);
  const total = countResult?.count ?? 0;

  const rows = await db
    .select(selectFields)
    .from(order)
    .innerJoin(user, eq(user.id, order.playerId))
    .innerJoin(dispatcherUser, eq(dispatcherUser.id, order.dispatcherId))
    .innerJoin(customer, eq(customer.id, order.customerId))
    .where(finalWhere)
    .orderBy(desc(order.startAt))
    .limit(PAGE_SIZE)
    .offset(offset);

  const baseParams = new URLSearchParams();
  if (q) baseParams.set("q", q);
  if (tab !== "PENDING_SETTLE") baseParams.set("tab", tab);
  if (dateFrom) baseParams.set("dateFrom", dateFrom);
  if (dateTo) baseParams.set("dateTo", dateTo);
  const baseHref = `/orders?${baseParams.toString()}`;

  return (
    <>
      <PageHeader
        title={me.role === "PLAYER" ? "我的订单" : "订单"}
        action={
          <div className="flex items-center gap-2">
            <Button asChild>
              <Link href="/orders/new">
                <Plus /> {isManager ? "派单" : "报单"}
              </Link>
            </Button>
          </div>
        }
      />

      <OrdersFilterBar
        q={q}
        tab={tab}
        dateFrom={dateFrom}
        dateTo={dateTo}
        role={me.role}
      />

      <OrdersList
        role={me.role}
        myId={me.id}
        initialOpenId={initialOpenId}
        currentTab={tab}
        searchQuery={q}
        dateFrom={dateFrom}
        dateTo={dateTo}
        orders={rows.map((r) => ({
          ...r,
          startAt: r.startAt.toISOString(),
          completedAt: r.completedAt?.toISOString() ?? null,
          canceledAt: r.canceledAt?.toISOString() ?? null,
          settledAt: r.settledAt?.toISOString() ?? null,
        }))}
      />

      <Pagination
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        baseHref={baseHref}
      />
    </>
  );
}
