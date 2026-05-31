import { requireSession } from "@/lib/auth-helpers";
import { ManagerOverview } from "./manager-overview";
import { PlayerOverview } from "./player-overview";
import { getActiveAnnouncements } from "@/server/actions/announcements";
import { AnnouncementsBanner } from "@/components/announcements-banner";

export default async function OverviewPage() {
  const { user } = await requireSession();
  const announcements = await getActiveAnnouncements();
  const bannerItems = announcements.map((a) => ({
    id: a.id,
    type: a.type,
    title: a.title,
    content: a.content,
    isPermanent: a.isPermanent,
    endAt: a.endAt?.toISOString() ?? null,
  }));

  return (
    <>
      <AnnouncementsBanner items={bannerItems} />
      {user.role === "PLAYER" ? (
        <PlayerOverview userId={user.id} userName={user.name} />
      ) : (
        <ManagerOverview userName={user.name} />
      )}
    </>
  );
}
