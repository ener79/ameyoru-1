import { getMyGiftRecords, fetchAndMarkUnreadGifts } from "@/server/actions/gifts";
import { requireSession } from "@/lib/auth-helpers";
import { MyGiftsClient } from "./my-gifts-client";

export default async function MyGiftsPage() {
  await requireSession({ role: "PLAYER" });
  // 进入此页面就把所有未读标记已读,并取出未读的具体记录用于弹窗
  const [records, unread] = await Promise.all([
    getMyGiftRecords(),
    fetchAndMarkUnreadGifts(),
  ]);

  return (
    <MyGiftsClient
      records={records.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
      }))}
      unread={unread}
    />
  );
}
