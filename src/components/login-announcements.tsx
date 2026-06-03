"use client";

import { useState } from "react";
import { Megaphone, PartyPopper, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Item {
  id: string;
  type: "NOTICE" | "ACTIVITY";
  title: string;
  content: string | null;
  contentJson: string | null;
  imagePath: string | null;
  isPermanent: boolean;
  endAt: string | null;
}

export function LoginAnnouncements({
  items,
  children,
}: {
  items: Item[];
  children: React.ReactNode;
}) {
  const [acknowledged, setAcknowledged] = useState(items.length === 0);

  if (acknowledged) return <>{children}</>;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg space-y-4">
        <div className="text-center space-y-2">
          <Megaphone className="size-10 text-primary mx-auto" />
          <h2 className="text-2xl font-bold">公告通知</h2>
          <p className="text-sm text-muted-foreground">请阅读以下公告后继续</p>
        </div>

        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          {items.map((item) => (
            <Card key={item.id} className="p-5">
              <div className="flex items-center gap-2 mb-2">
                {item.type === "NOTICE" ? (
                  <Megaphone className="size-5 text-primary shrink-0" />
                ) : (
                  <PartyPopper className="size-5 text-orange-500 shrink-0" />
                )}
                <span className="text-lg font-bold">{item.title}</span>
                {item.type === "ACTIVITY" && (
                  <Badge variant="secondary" className="text-xs">
                    {item.isPermanent ? "长期有效" : item.endAt ? `截止 ${new Date(item.endAt).toLocaleDateString()}` : "活动"}
                  </Badge>
                )}
              </div>
              {item.imagePath && (
                <img src={`/api/uploads/${item.imagePath}`} alt="" className="mt-2 rounded-md max-h-48 object-cover" />
              )}
              {item.content && (
                <p className="text-base text-foreground leading-relaxed whitespace-pre-wrap">
                  {item.content}
                </p>
              )}
            </Card>
          ))}
        </div>

        <Button className="w-full h-12 text-base font-semibold" onClick={() => setAcknowledged(true)}>
          <CheckCircle2 className="size-5" />
          我已阅读，继续登录
        </Button>
      </div>
    </div>
  );
}
