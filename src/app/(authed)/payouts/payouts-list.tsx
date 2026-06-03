"use client";

import { useRouter } from "next/navigation";
import { CheckCircle2, Clock, Wallet, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";
import {
  formatDateTime,
  formatDuration,
  formatRelativeDateTime,
  formatYuan,
} from "@/lib/format";
import type { OrderStatus, PayMethod, SettleStatus } from "@/db/schema";

interface PayoutRow {
  id: string;
  startAt: string;
  customerName: string;
  durationMin: number;
  playerEarnCents: number;
  playerCompensationCents: number;
  orderStatus: OrderStatus;
  settleStatus: SettleStatus;
  paidMethod: PayMethod | null;
  settledAt: string | null;
}

type TabKey = "all" | "UNSETTLED" | "SETTLED";

const methodLabel: Record<PayMethod, string> = {
  WECHAT: "微信",
  ALIPAY: "支付宝",
};

/** 取每行的实际打款金额:取消单是补偿,完成单是应得 */
function payoutCents(o: PayoutRow): number {
  return o.orderStatus === "CANCELED"
    ? o.playerCompensationCents
    : o.playerEarnCents;
}

export function PayoutsList({
  orders,
  tab,
  unsettledCount,
  totalCount,
  totalEarnCents,
}: {
  orders: PayoutRow[];
  tab: TabKey;
  unsettledCount: number;
  totalCount: number;
  totalEarnCents: number;
}) {
  const router = useRouter();

  function changeTab(v: TabKey) {
    router.push(v === "UNSETTLED" ? "/payouts" : `/payouts?tab=${v}`);
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs value={tab} onValueChange={(v) => changeTab(v as TabKey)}>
          <TabsList>
            <TabsTrigger value="UNSETTLED">
              待打款
              {unsettledCount > 0 && (
                <Badge variant="default" className="ml-1 h-4 px-1 text-[10px]">
                  {unsettledCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="SETTLED">已打款</TabsTrigger>
            <TabsTrigger value="all">全部</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="text-xs text-muted-foreground">
          {totalCount} 单 ·{" "}
          <span className="font-mono tabular-nums text-foreground">
            {formatYuan(totalEarnCents)}
          </span>
        </div>
      </div>

      {orders.length === 0 ? (
        <EmptyState
          icon={<Wallet />}
          title={tab === "UNSETTLED" ? "没有待打款订单" : "暂无记录"}
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <ul className="divide-y">
            {orders.map((o) => {
              const isCanceled = o.orderStatus === "CANCELED";
              const amount = payoutCents(o);
              return (
                <li
                  key={o.id}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-accent/40"
                >
                  <span
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-full",
                      o.settleStatus === "SETTLED"
                        ? "bg-success/10 text-success"
                        : isCanceled
                          ? "bg-muted text-muted-foreground"
                          : "bg-warning/15 text-warning"
                    )}
                  >
                    {o.settleStatus === "SETTLED" ? (
                      <CheckCircle2 className="size-4" />
                    ) : isCanceled ? (
                      <XCircle className="size-4" />
                    ) : (
                      <Clock className="size-4" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 truncate text-sm font-medium">
                      <span>{o.customerName}</span>
                      {isCanceled && (
                        <Badge variant="outline" className="text-[10px]">
                          取消补偿
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatRelativeDateTime(o.startAt)} ·{" "}
                      {formatDuration(o.durationMin)}
                      {o.settleStatus === "SETTLED" && o.settledAt && (
                        <>
                          {" · "}
                          {o.paidMethod && methodLabel[o.paidMethod]}打款于{" "}
                          {formatDateTime(o.settledAt)}
                        </>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-sm font-medium tabular-nums text-success">
                      {formatYuan(amount)}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {o.settleStatus === "SETTLED" ? "已到账" : "待打款"}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </>
  );
}
