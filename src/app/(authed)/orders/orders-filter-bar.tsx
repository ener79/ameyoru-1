"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useTransition } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface OrdersFilterBarProps {
  q: string;
  tab: string;
  dateFrom: string;
  dateTo: string;
  isManager: boolean;
}

export function OrdersFilterBar({ q, tab, dateFrom, dateTo, isManager }: OrdersFilterBarProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function buildUrl(overrides: Record<string, string>) {
    const sp = new URLSearchParams();
    const merged = { q, tab, dateFrom, dateTo, ...overrides };
    if (merged.q) sp.set("q", merged.q);
    if (merged.tab && merged.tab !== "PENDING_SETTLE") sp.set("tab", merged.tab);
    if (merged.dateFrom) sp.set("dateFrom", merged.dateFrom);
    if (merged.dateTo) sp.set("dateTo", merged.dateTo);
    // Always reset to page 1 when filter changes
    return `/orders?${sp.toString()}`;
  }

  function handleSearch(value: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      startTransition(() => router.push(buildUrl({ q: value })));
    }, 400);
  }

  function handleTabChange(newTab: string) {
    startTransition(() => router.push(buildUrl({ tab: newTab })));
  }

  function handleDate(field: "dateFrom" | "dateTo", value: string) {
    startTransition(() => router.push(buildUrl({ [field]: value })));
  }

  function clearSearch() {
    startTransition(() => router.push(buildUrl({ q: "" })));
  }

  return (
    <div className="mb-4 space-y-3">
      {/* Tab bar */}
      <Tabs value={tab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="PENDING_SETTLE">待结算</TabsTrigger>
          <TabsTrigger value="IN_PROGRESS">进行中</TabsTrigger>
          <TabsTrigger value="SETTLED">已结算</TabsTrigger>
          <TabsTrigger value="all">全部</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Search + date range */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            defaultValue={q}
            placeholder={isManager ? "搜索客户名/陪玩名/会员号…" : "搜索客户名…"}
            className="pl-9 pr-8"
            onChange={(e) => handleSearch(e.target.value)}
          />
          {q && (
            <button
              onClick={clearSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        {isManager && (
          <>
            <Input
              type="date"
              className="w-auto"
              value={dateFrom}
              onChange={(e) => handleDate("dateFrom", e.target.value)}
              placeholder="开始日期"
            />
            <Input
              type="date"
              className="w-auto"
              value={dateTo}
              onChange={(e) => handleDate("dateTo", e.target.value)}
              placeholder="结束日期"
            />
            {(dateFrom || dateTo) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => startTransition(() => router.push(buildUrl({ dateFrom: "", dateTo: "" })))}
              >
                <X className="size-3.5 mr-1" /> 清除日期
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
