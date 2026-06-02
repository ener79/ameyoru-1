"use client";

import { useEffect, useMemo, useState } from "react";
import { Gift, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/page-header";
import { KpiCard } from "@/components/kpi-card";
import { EmptyState } from "@/components/empty-state";
import { formatYuan, formatRelativeDateTime } from "@/lib/format";
import { GIFT_TIER_LABELS } from "@/lib/constants";

interface Record {
  id: string;
  giftTierCents: number;
  quantity: number;
  totalCents: number;
  platformFeeCents: number;
  playerEarnCents: number;
  senderNickname: string;
  note: string | null;
  createdAt: string;
}

interface UnreadRecord {
  id: string;
  giftTierCents: number;
  quantity: number;
  totalCents: number;
  platformFeeCents: number;
  playerEarnCents: number;
  senderNickname: string;
  createdAt: string;
}

interface Props {
  records: Record[];
  unread: UnreadRecord[];
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isSameMonth(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

export function MyGiftsClient({ records, unread }: Props) {
  const [popupOpen, setPopupOpen] = useState(false);

  useEffect(() => {
    if (unread.length > 0) setPopupOpen(true);
  }, [unread.length]);

  const stats = useMemo(() => {
    const now = new Date();
    const today = { count: 0, earn: 0 };
    const month = { count: 0, earn: 0 };
    const total = { count: records.length, earn: 0 };
    for (const r of records) {
      const d = new Date(r.createdAt);
      total.earn += r.playerEarnCents;
      if (isSameMonth(d, now)) {
        month.count += 1;
        month.earn += r.playerEarnCents;
      }
      if (isSameDay(d, now)) {
        today.count += 1;
        today.earn += r.playerEarnCents;
      }
    }
    return { today, month, total };
  }, [records]);

  return (
    <>
      <PageHeader title="礼物收入" description="外部平台打赏礼物的收入明细" />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <KpiCard
          label="今日收入"
          value={formatYuan(stats.today.earn)}
          hint={`今日 ${stats.today.count} 单`}
          emphasis
        />
        <KpiCard
          label="本月收入"
          value={formatYuan(stats.month.earn)}
          hint={`本月 ${stats.month.count} 单`}
        />
        <KpiCard
          label="累计收入"
          value={formatYuan(stats.total.earn)}
          hint={`共 ${stats.total.count} 单`}
        />
      </div>

      <div className="mt-6">
        {records.length === 0 ? (
          <EmptyState
            icon={<Gift />}
            title="还没有礼物记录"
            description="收到打赏后,管理员会在此为你登记"
          />
        ) : (
          <div className="space-y-2">
            {records.map((r) => (
              <Card key={r.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Gift className="size-4 text-pink-500" />
                      <Badge variant="default">
                        {GIFT_TIER_LABELS[r.giftTierCents] ??
                          r.giftTierCents / 100}{" "}
                        元
                      </Badge>
                      {r.quantity > 1 && (
                        <Badge variant="outline">× {r.quantity}</Badge>
                      )}
                      <span className="text-sm text-muted-foreground">
                        来自{" "}
                        <span className="font-medium text-foreground">
                          {r.senderNickname}
                        </span>
                      </span>
                    </div>
                    <div className="text-sm font-mono tabular-nums text-muted-foreground">
                      总额 {formatYuan(r.totalCents)} · 平台抽{" "}
                      <span className="text-orange-600">
                        {formatYuan(r.platformFeeCents)}
                      </span>{" "}
                      · 到手{" "}
                      <span className="text-primary font-semibold">
                        {formatYuan(r.playerEarnCents)}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatRelativeDateTime(r.createdAt)}
                      {r.note && <> · {r.note}</>}
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* 未读弹窗 */}
      <Dialog open={popupOpen} onOpenChange={setPopupOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="size-5 text-pink-500" />
              收到 {unread.length} 笔新礼物 💝
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {unread.map((u) => {
              const tier = GIFT_TIER_LABELS[u.giftTierCents] ?? u.giftTierCents / 100;
              return (
                <Card key={u.id} className="bg-pink-50/50 p-3 dark:bg-pink-950/20">
                  <div className="text-sm">
                    <span className="font-semibold">{u.senderNickname}</span>
                    {" 送了你 "}
                    <span className="font-semibold text-pink-600">
                      {tier} 元
                    </span>
                    {u.quantity > 1 && (
                      <span className="text-muted-foreground"> × {u.quantity}</span>
                    )}
                  </div>
                  <div className="mt-1 text-xs font-mono tabular-nums text-muted-foreground">
                    总额 {formatYuan(u.totalCents)} · 平台抽{" "}
                    {formatYuan(u.platformFeeCents)} · 到手{" "}
                    <span className="text-primary font-semibold">
                      {formatYuan(u.playerEarnCents)}
                    </span>
                  </div>
                </Card>
              );
            })}
          </div>
          <DialogFooter>
            <Button onClick={() => setPopupOpen(false)}>知道了</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
