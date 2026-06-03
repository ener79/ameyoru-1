import { eq, sql, and } from "drizzle-orm";
import { requireSession } from "@/lib/auth-helpers";
import { AppSidebar, type NavItem } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { getMyUnreadGiftCount } from "@/server/actions/gifts";
import { getSiteSettings } from "@/server/actions/site-settings";
import { db } from "@/db";
import { giftRecord } from "@/db/schema";
import type { Role } from "@/db/schema";

const bossNav: NavItem[] = [
  { href: "/overview", label: "总览" },
  { href: "/orders", label: "订单" },
  { href: "/orders/new", label: "派单" },
  { href: "/players", label: "陪玩" },
  { href: "/staff", label: "员工" },
  { href: "/customers", label: "客户" },
  { href: "/leaderboard", label: "排行榜" },
  { href: "/announcements", label: "公告" },
  { href: "/gifts", label: "礼物" },
  { href: "/audit-log", label: "日志" },
  { href: "/site-settings", label: "站点设置" },
];

const staffNav: NavItem[] = [
  { href: "/overview", label: "总览" },
  { href: "/orders", label: "订单" },
  { href: "/orders/new", label: "派单" },
  { href: "/players", label: "陪玩" },
  { href: "/staff", label: "员工" },
  { href: "/customers", label: "客户" },
  { href: "/leaderboard", label: "排行榜" },
  { href: "/announcements", label: "公告" },
  { href: "/gifts", label: "礼物" },
  { href: "/site-settings", label: "站点设置" },
];

const playerNav: NavItem[] = [
  { href: "/overview", label: "总览" },
  { href: "/orders/new", label: "报单" },
  { href: "/orders", label: "我的订单" },
  { href: "/payouts", label: "打款明细" },
  { href: "/my-gifts", label: "礼物收入" },
  { href: "/leaderboard", label: "排行榜" },
];

function navForRole(role: Role): NavItem[] {
  if (role === "BOSS") return bossNav;
  if (role === "STAFF") return staffNav;
  return playerNav;
}

const roleLabel: Record<Role, string> = {
  BOSS: "店主",
  STAFF: "店长",
  PLAYER: "陪玩",
};

export default async function AuthedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [{ user }, siteSettingsData] = await Promise.all([
    requireSession(),
    getSiteSettings(),
  ]);
  const nav = navForRole(user.role);

  let withBadges = nav;
  if (user.role === "PLAYER") {
    // 陪玩:未读已支付礼物数 + 自己的待支付报单数 都体现在「礼物收入」入口
    const [{ count: unread }, pendingRows] = await Promise.all([
      getMyUnreadGiftCount(),
      db
        .select({ count: sql<number>`count(*)`.mapWith(Number) })
        .from(giftRecord)
        .where(
          and(
            eq(giftRecord.playerId, user.id),
            eq(giftRecord.settleStatus, "UNSETTLED")
          )
        ),
    ]);
    const pending = pendingRows[0]?.count ?? 0;
    const total = unread + pending;
    if (total > 0) {
      withBadges = nav.map((item) =>
        item.href === "/my-gifts" ? { ...item, badge: total } : item
      );
    }
  } else if (user.role === "BOSS" || user.role === "STAFF") {
    // 后台:待支付礼物报单数体现在「礼物」入口
    const pendingRows = await db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(giftRecord)
      .where(eq(giftRecord.settleStatus, "UNSETTLED"));
    const pending = pendingRows[0]?.count ?? 0;
    if (pending > 0) {
      withBadges = nav.map((item) =>
        item.href === "/gifts" ? { ...item, badge: pending } : item
      );
    }
  }

  return (
    <SidebarProvider>
      <AppSidebar
        items={withBadges}
        user={{
          displayName: user.name,
          username: user.username,
          roleLabel: roleLabel[user.role],
        }}
        site={{
          siteName: siteSettingsData.siteName,
          logoPath: siteSettingsData.logoPath,
        }}
      />
      <SidebarInset>
        <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70 px-4">
          <SidebarTrigger className="-ml-1" />
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
