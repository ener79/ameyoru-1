"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ActorOption {
  id: string;
  name: string;
}

interface ActionOption {
  value: string;
  label: string;
}

interface AuditFilterBarProps {
  actor: string;
  action: string;
  actorOptions: ActorOption[];
  actionOptions: ActionOption[];
}

// Radix Select 不允许空字符串作为 value,用哨兵代表"全部"
const ALL = "__all__";

export function AuditFilterBar({
  actor,
  action,
  actorOptions,
  actionOptions,
}: AuditFilterBarProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function buildUrl(overrides: { actor?: string; action?: string }) {
    const next = { actor, action, ...overrides };
    const sp = new URLSearchParams();
    if (next.actor) sp.set("actor", next.actor);
    if (next.action) sp.set("action", next.action);
    const qs = sp.toString();
    return qs ? `/audit-log?${qs}` : "/audit-log";
  }

  function handleActor(value: string) {
    startTransition(() =>
      router.push(buildUrl({ actor: value === ALL ? "" : value }))
    );
  }

  function handleAction(value: string) {
    startTransition(() =>
      router.push(buildUrl({ action: value === ALL ? "" : value }))
    );
  }

  function clearAll() {
    startTransition(() => router.push("/audit-log"));
  }

  const hasFilter = !!actor || !!action;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <Select value={actor || ALL} onValueChange={handleActor}>
        <SelectTrigger className="min-w-40">
          <SelectValue placeholder="操作人" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>全部操作人</SelectItem>
          {actorOptions.map((a) => (
            <SelectItem key={a.id} value={a.id}>
              {a.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={action || ALL} onValueChange={handleAction}>
        <SelectTrigger className="min-w-36">
          <SelectValue placeholder="操作类型" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>全部类型</SelectItem>
          {actionOptions.map((a) => (
            <SelectItem key={a.value} value={a.value}>
              {a.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {pending && (
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      )}

      {hasFilter && !pending && (
        <Button variant="ghost" size="sm" onClick={clearAll}>
          <X className="size-3.5 mr-1" /> 清除筛选
        </Button>
      )}
    </div>
  );
}
