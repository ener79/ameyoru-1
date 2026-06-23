import { Users } from "lucide-react";
import { requireSession } from "@/lib/auth-helpers";
import { customerSummary, customerTotals } from "@/server/stats";
import { listActivePlayersAction } from "@/server/actions/customers";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { SearchBar } from "@/components/search-bar";
import { Pagination } from "@/components/pagination";
import { formatDuration, formatYuan } from "@/lib/format";
import { CustomersList } from "./customers-list";
import { MergeDuplicatesButton } from "./merge-duplicates-button";

const PAGE_SIZE = 30;

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  await requireSession({ role: ["BOSS", "STAFF"] });
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const page = Math.max(1, parseInt(params.page ?? "1") || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const [rows, totals, players] = await Promise.all([
    customerSummary({ q, limit: PAGE_SIZE, offset }),
    customerTotals({ q }),
    listActivePlayersAction(),
  ]);

  const baseHref = q ? `/customers?q=${encodeURIComponent(q)}` : "/customers";

  return (
    <>
      <PageHeader
        title="客户"
        description={`${totals.count} 位客户 · ${totals.repeats} 位回头客 · 累计 ${formatYuan(totals.totalSpent)} · ${formatDuration(totals.totalDuration)} · 预存余额 ${formatYuan(totals.totalBalance)}`}
        action={<MergeDuplicatesButton />}
      />

      <div className="mb-4">
        <SearchBar placeholder="搜索客户名 / 会员号 / 微信…" />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Users />}
          title={q ? `没有匹配"${q}"的客户` : "还没有客户"}
          description={q ? "换个关键词试试" : "陪玩报单或客服派单时,客户自动加入"}
        />
      ) : (
        <>
          <CustomersList
            customers={rows.map((c) => ({
              id: c.customerId,
              name: c.name,
              memberNo: c.memberNo,
              wechat: c.wechat,
              note: c.note,
              orderCount: c.orderCount,
              payableCents: c.payableCents,
              durationMin: c.durationMin,
              balanceCents: c.balanceCents,
            }))}
            players={players}
            startIndex={offset}
          />
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={totals.count}
            baseHref={baseHref}
          />
        </>
      )}
    </>
  );
}
