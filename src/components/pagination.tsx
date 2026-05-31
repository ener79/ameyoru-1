"use client";

import { useTransition } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export function Pagination({
  page,
  total,
  pageSize,
  buildUrl,
}: {
  page: number;
  total: number;
  pageSize: number;
  buildUrl: (p: number) => string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const totalPages = Math.ceil(total / pageSize);

  if (totalPages <= 1) return null;

  function goTo(p: number) {
    startTransition(() => router.push(buildUrl(p)));
  }

  return (
    <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
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
