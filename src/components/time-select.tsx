"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

export interface TimeValue {
  hour: number;
  minute: number;
}

export function TimeSelect({
  value,
  onChange,
}: {
  value: TimeValue;
  onChange: (v: TimeValue) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <Select
        value={String(value.hour)}
        onValueChange={(v) => onChange({ ...value, hour: Number(v) })}
      >
        <SelectTrigger className="w-20 font-mono tabular-nums">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {HOURS.map((h) => (
            <SelectItem key={h} value={String(h)}>
              {pad(h)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="text-muted-foreground font-medium">:</span>
      <Select
        value={String(value.minute)}
        onValueChange={(v) => onChange({ ...value, minute: Number(v) })}
      >
        <SelectTrigger className="w-20 font-mono tabular-nums">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {MINUTES.map((m) => (
            <SelectItem key={m} value={String(m)}>
              {pad(m)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
