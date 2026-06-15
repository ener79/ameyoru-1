"use client";

import { useState } from "react";
import { format, isToday, isYesterday } from "date-fns";
import { zhCN } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

function friendlyDate(d: Date): string {
  if (isToday(d)) return `今天 ${format(d, "M/d")}`;
  if (isYesterday(d)) return `昨天 ${format(d, "M/d")}`;
  return format(d, "M月d日 EEEE", { locale: zhCN });
}

export function DatePicker({
  value,
  onChange,
}: {
  value: Date;
  onChange: (d: Date) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="justify-start font-normal">
          <CalendarIcon className="size-4 text-muted-foreground" />
          {friendlyDate(value)}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value}
          onSelect={(d) => {
            if (d) {
              onChange(d);
              setOpen(false);
            }
          }}
          defaultMonth={value}
        />
      </PopoverContent>
    </Popover>
  );
}
