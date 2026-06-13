"use client";

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface PlayerOption {
  id: string;
  name: string;
  username: string | null;
  active: boolean;
}

interface Props {
  players: PlayerOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  /** 显示「全部」选项;用于筛选场景 */
  allowAll?: boolean;
  className?: string;
}

/**
 * 陪玩选择器:基于 shadcn Popover + Command(cmdk)。
 * - 输入按姓名/用户名子串匹配(cmdk 内置)
 * - 键盘 ↑↓ 选择,Enter 确认,Esc 关闭(cmdk 内置)
 * - 停用陪玩排在后面并加灰底
 */
export function PlayerCombobox({
  players,
  value,
  onChange,
  placeholder = "搜索陪玩…",
  allowAll = false,
  className,
}: Props) {
  const [open, setOpen] = useState(false);

  const selected = useMemo(
    () => players.find((p) => p.id === value),
    [players, value]
  );

  // 活跃优先,再按姓名排序
  const sorted = useMemo(
    () =>
      [...players].sort((a, b) => {
        if (a.active !== b.active) return a.active ? -1 : 1;
        return a.name.localeCompare(b.name, "zh-Hans-CN");
      }),
    [players]
  );

  function pick(id: string) {
    onChange(id);
    setOpen(false);
  }

  const displayLabel = selected
    ? `${selected.name}${selected.active ? "" : "（已停用）"}`
    : allowAll && value === ""
      ? "全部陪玩"
      : "";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "h-9 w-full justify-between font-normal",
            !displayLabel && "text-muted-foreground",
            className
          )}
        >
          <span className="truncate">{displayLabel || placeholder}</span>
          <div className="flex items-center gap-1 shrink-0">
            {selected && !allowAll && (
              <span
                role="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.stopPropagation();
                  onChange("");
                }}
                className="inline-flex size-4 items-center justify-center rounded hover:bg-muted"
                aria-label="清除"
              >
                <X className="size-3" />
              </span>
            )}
            <ChevronsUpDown className="size-3.5 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command>
          <CommandInput placeholder={placeholder} className="h-9" />
          <CommandList>
            <CommandEmpty>没找到匹配的陪玩</CommandEmpty>
            <CommandGroup>
              {allowAll && (
                <CommandItem value="全部陪玩" onSelect={() => pick("")}>
                  <Check
                    className={cn(
                      "size-3.5 shrink-0",
                      value === "" ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="flex-1 truncate">全部陪玩</span>
                </CommandItem>
              )}
              {sorted.map((p) => (
                <CommandItem
                  key={p.id}
                  value={`${p.name} ${p.username ?? ""}`}
                  onSelect={() => pick(p.id)}
                  className={cn(!p.active && "opacity-60")}
                >
                  <Check
                    className={cn(
                      "size-3.5 shrink-0",
                      value === p.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="flex-1 truncate">
                    {p.name}
                    {!p.active && (
                      <span className="ml-1 text-xs text-muted-foreground">
                        (已停用)
                      </span>
                    )}
                  </span>
                  {p.username && (
                    <span className="text-xs text-muted-foreground shrink-0">
                      @{p.username}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
