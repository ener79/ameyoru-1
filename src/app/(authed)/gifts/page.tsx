import { listGiftRecords, listPlayersForGift } from "@/server/actions/gifts";
import { requireSession } from "@/lib/auth-helpers";
import { GiftsAdminClient } from "./gifts-client";

interface PageProps {
  searchParams: Promise<{
    playerId?: string;
    tier?: string;
    startAt?: string;
    endAt?: string;
    page?: string;
  }>;
}

export default async function GiftsAdminPage({ searchParams }: PageProps) {
  await requireSession({ role: ["BOSS", "STAFF"] });
  const sp = await searchParams;

  const filter = {
    playerId: sp.playerId || undefined,
    giftTierCents: sp.tier ? Number(sp.tier) : undefined,
    startAt: sp.startAt || null,
    endAt: sp.endAt || null,
    page: sp.page ? Math.max(1, Number(sp.page)) : 1,
    pageSize: 50,
  };

  const [{ rows, total, page, pageSize }, players] = await Promise.all([
    listGiftRecords(filter),
    listPlayersForGift(),
  ]);

  return (
    <GiftsAdminClient
      players={players}
      records={rows.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
      }))}
      total={total}
      page={page}
      pageSize={pageSize}
      filter={{
        playerId: sp.playerId ?? "",
        tier: sp.tier ?? "",
        startAt: sp.startAt ?? "",
        endAt: sp.endAt ?? "",
      }}
    />
  );
}
