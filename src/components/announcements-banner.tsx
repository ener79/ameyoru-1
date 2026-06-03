"use client";

import { useState } from "react";
import { Megaphone, PartyPopper, ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

interface AnnouncementItem {
  id: string;
  type: "NOTICE" | "ACTIVITY";
  title: string;
  content: string | null;
  contentJson: string | null;
  imagePath: string | null;
  isPermanent: boolean;
  endAt: string | null;
}

export function AnnouncementsBanner({ items }: { items: AnnouncementItem[] }) {
  const [expanded, setExpanded] = useState(false);
  if (items.length === 0) return null;

  const notices = items.filter((i) => i.type === "NOTICE");
  const activities = items.filter((i) => i.type === "ACTIVITY");
  const showToggle = items.length > 2;
  const visible = expanded ? items : items.slice(0, 2);
  const formatEndDate = (date: string) =>
    new Date(date).toLocaleDateString("zh-CN", {
      timeZone: "Asia/Shanghai",
    });

  return (
    <div className="space-y-2 mb-4">
      {visible.map((item) => (
        <Card key={item.id} className="px-4 py-3 flex items-start gap-3">
          <div className="shrink-0 mt-0.5">
            {item.type === "NOTICE" ? <Megaphone className="size-4 text-primary" /> : <PartyPopper className="size-4 text-orange-500" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-bold text-base">{item.title}</span>
              {item.type === "ACTIVITY" && (
                <Badge variant="outline" className="text-[10px]">
                  {item.isPermanent ? "长期有效" : item.endAt ? `截止 ${formatEndDate(item.endAt)}` : "活动"}
                </Badge>
              )}
            </div>
            {item.imagePath && (
              <img src={`/api/uploads/${item.imagePath}`} alt="" className="mt-2 rounded-md max-h-40 object-cover" />
            )}
            {item.content && <p className="text-sm text-foreground/80 mt-1 line-clamp-3">{item.content}</p>}
          </div>
        </Card>
      ))}
      {showToggle && (
        <button onClick={() => setExpanded(!expanded)} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 mx-auto">
          {expanded ? <><ChevronUp className="size-3" /> 收起</> : <><ChevronDown className="size-3" /> 查看全部 {items.length} 条</>}
        </button>
      )}
    </div>
  );
}
