import { listGiftRecords, listPlayersForGift } from "@/server/actions/gifts";
import { requireSession } from "@/lib/auth-helpers";
import { GiftsAdminClient } from "./gifts-client";

interface PageProps {
  searchParams: Promise<{
    playerId?: string;
    tier?: string;
    tab?: string;
    startAt?: string;
    endAt?: string;
    page?: string;
  }>;
}

export default async function GiftsAdminPage({ searchParams }: PageProps) {
  await requireSession({ role: ["BOSS", "STAFF", "SERVICE"] });
  const sp = await searchParams;

  const tab = sp.tab ?? "pending"; // 默认显示待支付
  const settleStatus =
    tab === "pending" ? "UNSETTLED" : tab === "settled" ? "SETTLED" : undefined;

  const filter = {
    playerId: sp.playerId || undefined,
    giftTierCents: sp.tier ? Number(sp.tier) : undefined,
    settleStatus,
    startAt: sp.startAt || null,
    endAt: sp.endAt || null,
    page: sp.page ? Math.max(1, Number(sp.page)) : 1,
    pageSize: 50,
  } as const;

  const [{ rows, total, pendingCount, page, pageSize }, players] = await Promise.all([
    listGiftRecords(filter),
    listPlayersForGift(),
  ]);

  return (
    <GiftsAdminClient
      players={players}
      records={rows.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        settledAt: r.settledAt ? r.settledAt.toISOString() : null,
      }))}
      total={total}
      pendingCount={pendingCount}
      page={page}
      pageSize={pageSize}
      filter={{
        playerId: sp.playerId ?? "",
        tier: sp.tier ?? "",
        tab,
        startAt: sp.startAt ?? "",
        endAt: sp.endAt ?? "",
      }}
    />
  );
}
