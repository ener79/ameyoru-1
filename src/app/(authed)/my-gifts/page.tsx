import { getMyGiftRecords, getMyGiftStats, fetchAndMarkUnreadGifts } from "@/server/actions/gifts";
import { requireSession } from "@/lib/auth-helpers";
import { Pagination } from "@/components/pagination";
import { MyGiftsClient } from "./my-gifts-client";

const PAGE_SIZE = 30;

export default async function MyGiftsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; page?: string }>;
}) {
  const { user: me } = await requireSession({ role: "PLAYER" });
  const params = await searchParams;
  const tab = params.tab === "pending" || params.tab === "settled" ? params.tab : "all";
  const page = Math.max(1, parseInt(params.page ?? "1") || 1);
  const offset = (page - 1) * PAGE_SIZE;

  // 进入此页面就把所有未读标记已读,并取出未读的具体记录用于弹窗
  const [stats, records, unread] = await Promise.all([
    getMyGiftStats(),
    getMyGiftRecords({ tab, limit: PAGE_SIZE, offset }),
    fetchAndMarkUnreadGifts(),
  ]);

  const total =
    tab === "pending" ? stats.pending : tab === "settled" ? stats.total.count : stats.total.count + stats.pending;
  const baseHref = tab === "all" ? "/my-gifts" : `/my-gifts?tab=${tab}`;

  return (
    <>
      <MyGiftsClient
        myId={me.id}
        tab={tab}
        stats={stats}
        records={records.map((r) => ({
          ...r,
          createdAt: r.createdAt.toISOString(),
          settledAt: r.settledAt ? r.settledAt.toISOString() : null,
        }))}
        unread={unread}
      />
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} baseHref={baseHref} />
    </>
  );
}
