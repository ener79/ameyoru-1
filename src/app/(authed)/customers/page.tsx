import { Users } from "lucide-react";
import { requireSession } from "@/lib/auth-helpers";
import { customerSummary } from "@/server/stats";
import { listActivePlayersAction } from "@/server/actions/customers";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { formatDuration, formatYuan } from "@/lib/format";
import { CustomersList } from "./customers-list";

export default async function CustomersPage() {
  await requireSession({ role: ["BOSS", "STAFF"] });
  const [rows, players] = await Promise.all([
    customerSummary(),
    listActivePlayersAction(),
  ]);

  const totalSpent = rows.reduce((s, r) => s + r.payableCents, 0);
  const totalDuration = rows.reduce((s, r) => s + r.durationMin, 0);
  const totalBalance = rows.reduce((s, r) => s + r.balanceCents, 0);
  const repeats = rows.filter((r) => r.orderCount >= 2).length;

  return (
    <>
      <PageHeader
        title="客户"
        description={`${rows.length} 位客户 · ${repeats} 位回头客 · 累计 ${formatYuan(totalSpent)} · ${formatDuration(totalDuration)} · 预存余额 ${formatYuan(totalBalance)}`}
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={<Users />}
          title="还没有客户"
          description="陪玩报单或客服派单时,客户自动加入"
        />
      ) : (
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
        />
      )}
    </>
  );
}
