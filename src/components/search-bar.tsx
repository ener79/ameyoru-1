"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTransition, useRef } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function SearchBar({
  placeholder = "搜索…",
  paramName = "q",
}: {
  placeholder?: string;
  paramName?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const current = searchParams.get(paramName) ?? "";
  const inputRef = useRef<HTMLInputElement>(null);

  function navigate(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(paramName, value);
    } else {
      params.delete(paramName);
    }
    params.delete("page"); // reset page on new search
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  return (
    <div className="relative flex items-center">
      <Search className="absolute left-3 size-4 text-muted-foreground pointer-events-none" />
      <Input
        ref={inputRef}
        defaultValue={current}
        placeholder={placeholder}
        className="pl-9 pr-8 h-9 w-48 sm:w-64"
        onKeyDown={(e) => {
          if (e.key === "Enter") navigate(e.currentTarget.value.trim());
        }}
        onBlur={(e) => navigate(e.currentTarget.value.trim())}
      />
      {current && (
        <Button
          size="icon"
          variant="ghost"
          className="absolute right-1 h-6 w-6"
          onClick={() => {
            if (inputRef.current) inputRef.current.value = "";
            navigate("");
          }}
        >
          <X className="size-3" />
        </Button>
      )}
    </div>
  );
}
