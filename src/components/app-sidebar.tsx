"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  ClipboardList,
  Contact,
  FilePlus,
  Gift,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Monitor,
  Moon,
  MoreHorizontal,
  ScrollText,
  Settings,
  Sun,
  Trophy,
  UserCircle,
  UserCog,
  Users,
  Wallet,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { avatarInitial } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

export interface NavItem {
  href: string;
  label: string;
  badge?: number;
}

export interface AppSidebarProps {
  items: NavItem[];
  user: {
    displayName: string;
    username: string;
    roleLabel: string;
  };
  site?: {
    siteName: string;
    logoPath: string | null;
  };
}

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  "/overview": LayoutDashboard,
  "/orders": ClipboardList,
  "/orders/new": FilePlus,
  "/players": Users,
  "/staff": UserCog,
  "/customers": Contact,
  "/leaderboard": Trophy,
  "/announcements": Megaphone,
  "/gifts": Gift,
  "/my-gifts": Gift,
  "/audit-log": ScrollText,
  "/payouts": Wallet,
  "/site-settings": Settings,
};

const exactMatchPaths = new Set([
  "/overview",
  "/orders",
  "/orders/new",
  "/players",
  "/staff",
  "/customers",
  "/leaderboard",
  "/payouts",
  "/profile",
  "/announcements",
  "/audit-log",
]);

function isActive(pathname: string, href: string) {
  if (exactMatchPaths.has(href)) return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

const themeOptions = [
  { value: "light", label: "浅色", icon: Sun },
  { value: "dark", label: "深色", icon: Moon },
  { value: "system", label: "跟随系统", icon: Monitor },
] as const;

export function AppSidebar({ items, user, site }: AppSidebarProps) {
  const siteName = site?.siteName ?? "起点乱斗";
  const logoSrc = site?.logoPath ? `/api/uploads/${site.logoPath}` : "/logo.png";
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  async function handleSignOut() {
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg">
                  <Image src={logoSrc} alt={siteName} width={28} height={28} className="rounded-lg" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-bold">{siteName}</span>
                  <span className="truncate text-xs text-muted-foreground">内部管理系统</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const Icon = iconMap[item.href] ?? LayoutDashboard;
                const active = isActive(pathname, item.href);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                      <Link href={item.href}>
                        <Icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                    {item.badge && item.badge > 0 && (
                      <SidebarMenuBadge className="bg-red-500 text-white text-[10px]">
                        {item.badge > 99 ? "99+" : item.badge}
                      </SidebarMenuBadge>
                    )}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <Avatar className="size-8 rounded-lg">
                    <AvatarFallback className="rounded-lg bg-primary/10 text-primary text-xs font-semibold">
                      {avatarInitial(user.displayName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{user.displayName}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {user.roleLabel}
                      {user.username ? ` · ${user.username}` : ""}
                    </span>
                  </div>
                  <MoreHorizontal className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="top"
                align="start"
                className="w-56 rounded-lg"
              >
                <DropdownMenuLabel className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">{user.displayName}</span>
                  <span className="text-xs text-muted-foreground">
                    {user.roleLabel}
                    {user.username ? ` · ${user.username}` : ""}
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/profile">
                    <UserCircle /> 我的资料
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/change-password">
                    <KeyRound /> 修改密码
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {themeOptions.map((opt) => (
                  <DropdownMenuItem
                    key={opt.value}
                    onClick={() => setTheme(opt.value)}
                    className={cn(theme === opt.value && "bg-accent font-medium")}
                  >
                    <opt.icon /> {opt.label}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={handleSignOut}>
                  <LogOut /> 退出登录
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
