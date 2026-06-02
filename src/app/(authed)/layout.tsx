import { requireSession } from "@/lib/auth-helpers";
import { AppNav, type NavItem } from "@/components/app-nav";
import { getMyUnreadGiftCount } from "@/server/actions/gifts";
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
  const { user } = await requireSession();
  const nav = navForRole(user.role);

  // 仅陪玩查询未读礼物数量,用于「礼物收入」入口的红点徽章
  let withBadges = nav;
  if (user.role === "PLAYER") {
    const { count } = await getMyUnreadGiftCount();
    if (count > 0) {
      withBadges = nav.map((item) =>
        item.href === "/my-gifts" ? { ...item, badge: count } : item
      );
    }
  }

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <AppNav
        items={withBadges}
        user={{
          displayName: user.name,
          username: user.username,
          roleLabel: roleLabel[user.role],
        }}
      />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>
    </div>
  );
}
