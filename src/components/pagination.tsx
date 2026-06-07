"use client";

import { useTransition } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export function Pagination({
  page,
  total,
  pageSize,
  baseHref,
}: {
  page: number;
  total: number;
  pageSize: number;
  baseHref: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const totalPages = Math.ceil(total / pageSize);

  if (totalPages <= 1) return null;

  function goTo(p: number) {
    const sep = baseHref.includes("?") ? "&" : "?";
    startTransition(() => router.push(`${baseHref}${sep}page=${p}`));
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 mt-4 text-sm text-muted-foreground">
      <span>
        第 {page}/{totalPages} 页 · 共 {total} 条
      </span>
      <div className="flex gap-1">
        <Button
          size="icon"
          variant="outline"
          className="h-8 w-8"
          disabled={page <= 1}
          onClick={() => goTo(page - 1)}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <Button
          size="icon"
          variant="outline"
          className="h-8 w-8"
          disabled={page >= totalPages}
          onClick={() => goTo(page + 1)}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
