"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, KeyRound, Menu, UserCircle } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { avatarInitial } from "@/lib/format";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export interface NavItem {
  href: string;
  label: string;
  badge?: number;
}

export interface AppNavProps {
  items: NavItem[];
  user: {
    displayName: string;
    username: string;
    roleLabel: string;
  };
}

// 路径需要 exact match 以避免互相误高亮(同级路径)
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

export function AppNav({ items, user }: AppNavProps) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleSignOut() {
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }

  const currentItem = items.find((item) => isActive(pathname, item.href));

  return (
    <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4 sm:gap-4 sm:px-6">
        {/* 移动端汉堡菜单 — sm 之下用,完整列出 nav items */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 sm:hidden"
              aria-label="导航菜单"
            >
              <Menu />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44">
            {items.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <DropdownMenuItem key={item.href} asChild>
                  <Link
                    href={item.href}
                    className={cn(active && "bg-secondary font-medium")}
                  >
                    <span className="flex-1">{item.label}</span>
                    {item.badge && item.badge > 0 ? (
                      <span className="ml-2 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
                        {item.badge > 99 ? "99+" : item.badge}
                      </span>
                    ) : null}
                  </Link>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>

        <Link href="/" className="flex items-center gap-2 shrink-0">
          <Image src="/logo.png" alt="起点乱斗" width={28} height={28} className="rounded-lg" />
          <span className="hidden text-sm font-semibold tracking-tight sm:inline">
            <span className="font-black italic">起点</span><span className="font-black italic text-red-500">乱斗</span>
          </span>
        </Link>

        {/* 移动端只显示当前页面名,避免 tab 横向溢出 */}
        {currentItem && (
          <span className="ml-1 text-sm font-medium sm:hidden">
            {currentItem.label}
          </span>
        )}

        {/* sm+ 显示完整 tab 列表 */}
        <nav className="hidden flex-1 items-center gap-0.5 overflow-x-auto sm:flex">
          {items.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                {item.label}
                {item.badge && item.badge > 0 ? (
                  <span className="absolute -top-0.5 -right-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
                    {item.badge > 99 ? "99+" : item.badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        {/* 撑开右侧用户菜单 */}
        <div className="flex-1 sm:hidden" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="h-9 gap-2 pl-1.5 pr-2 sm:pr-3"
              aria-label="用户菜单"
            >
              <Avatar className="size-6">
                <AvatarFallback className="bg-primary/10 text-primary text-[11px] font-semibold">
                  {avatarInitial(user.displayName)}
                </AvatarFallback>
              </Avatar>
              <span className="hidden text-sm sm:inline">
                {user.displayName}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
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
            <DropdownMenuItem variant="destructive" onClick={handleSignOut}>
              <LogOut /> 退出登录
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
