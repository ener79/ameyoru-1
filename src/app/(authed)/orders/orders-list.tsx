"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CheckCircle2,
  CheckSquare,
  Inbox,
  ZoomIn,
  Loader2,
  MessageCircle,
  RotateCcw,
  Tag,
  XCircle,
} from "lucide-react";
import { ExportCSVButton } from "@/components/export-csv-button";
import { exportOrdersCSV } from "@/server/actions/export";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import {
  OrderStatusBadge,
  OrderStatusGroup,
} from "@/components/order-status-badge";
import {
  avatarInitial,
  centsToYuanString,
  formatDateTime,
  formatDuration,
  formatEndAt,
  formatRelativeDateTime,
  formatYuan,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import type {
  CancelFault,
  OrderStatus,
  PayMethod,
  Role,
  SettleStatus,
} from "@/db/schema";
import {
  adjustOrderDurationAction,
  batchSettleAction,
  cancelOrderAction,
  completeOrderAction,
  settleOrderAction,
  unsettleOrderAction,
} from "@/server/actions/orders";

interface OrderRow {
  id: string;
  playerId: string;
  playerName: string;
  playerWechatQrPath: string | null;
  playerAlipayQrPath: string | null;
  dispatcherId: string;
  dispatcherName: string;
  customerName: string;
  customerMemberNo: string;
  customerWechat: string | null;
  startAt: string;
  durationMin: number;
  hourlyRateCents: number;
  originalCents: number;
  discountCents: number;
  payableCents: number;
  prepayUsedCents: number;
  commissionCents: number;
  playerEarnCents: number;
  playerCompensationCents: number;
  orderStatus: OrderStatus;
  settleStatus: SettleStatus;
  completedAt: string | null;
  canceledAt: string | null;
  settledAt: string | null;
  paidMethod: PayMethod | null;
  cancelFault: CancelFault | null;
  cancelNote: string | null;
  note: string | null;
  depositPaid: boolean;
}


const faultLabel: Record<CancelFault, string> = {
  PLAYER: "陪玩责任",
  CUSTOMER: "客户责任",
  SHOP: "店里责任",
  OTHER: "其他",
};

/** 行展示给陪玩看的金额:已完成用应得,已取消用补偿 */
function rowPayoutCents(o: OrderRow): number {
  return o.orderStatus === "CANCELED"
    ? o.playerCompensationCents
    : o.playerEarnCents;
}

export function OrdersList({
  role,
  myId,
  orders,
  initialOpenId,
  currentTab,
  searchQuery,
  dateFrom,
  dateTo,
}: {
  role: Role;
  myId: string;
  orders: OrderRow[];
  initialOpenId?: string | null;
  currentTab?: string;
  searchQuery?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  const canManage = role === "BOSS" || role === "STAFF";

  function handleExportCSV() {
    return exportOrdersCSV({ q: searchQuery, dateFrom, dateTo });
  }
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(initialOpenId ?? null);
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchMethod, setBatchMethod] = useState<"WECHAT" | "ALIPAY" | undefined>(undefined);
  const [batchPending, startBatchTransition] = useTransition();

  // Orders are already filtered server-side; show all passed orders
  const filtered = orders;

  const totals = useMemo(() => {
    const payable = filtered.reduce(
      (s, o) => s + (o.orderStatus === "COMPLETED" ? o.payableCents : 0),
      0
    );
    const earn = filtered.reduce((s, o) => s + rowPayoutCents(o), 0);
    return { count: filtered.length, payable, earn };
  }, [filtered]);

  const openOrder = openId ? orders.find((o) => o.id === openId) ?? null : null;

  function handleBatchSettle() {
    const pendingIds = filtered
      .filter(
        (o) =>
          o.settleStatus === "UNSETTLED" &&
          (o.orderStatus === "COMPLETED" || o.orderStatus === "CANCELED")
      )
      .map((o) => o.id);
    if (!pendingIds.length) return;
    startBatchTransition(async () => {
      const res = await batchSettleAction({ ids: pendingIds, paidMethod: batchMethod });
      if (res.ok) {
        toast.success(`已批量结算 ${res.count} 单`);
        setBatchOpen(false);
        router.refresh();
      } else {
        toast.error((res as { ok: false; error: string }).error);
      }
    });
  }


  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-end gap-3">
        <div className="flex items-center gap-2">
          {canManage && currentTab === "PENDING_SETTLE" && filtered.some((o) => o.settleStatus === "UNSETTLED" && (o.orderStatus === "COMPLETED" || o.orderStatus === "CANCELED")) && (
            <Button size="sm" variant="outline" onClick={() => setBatchOpen(true)}>
              <CheckSquare className="size-4" /> 全部结算
            </Button>
          )}
          {canManage && <ExportCSVButton label="导出" onExport={handleExportCSV} />}
          <div className="text-xs text-muted-foreground">
            {totals.count} 单 ·{" "}
            <span className="font-mono tabular-nums text-foreground">
              {formatYuan(canManage ? totals.payable : totals.earn)}
            </span>
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<Inbox />} title="暂无订单" />
      ) : (
        <Card className="overflow-hidden p-0">
          <ul className="divide-y">
            {filtered.map((o) => {
              const isCanceled = o.orderStatus === "CANCELED";
              const payoutCents = rowPayoutCents(o);
              return (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => setOpenId(o.id)}
                    className={cn(
                      "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/60",
                      o.orderStatus === "IN_PROGRESS" && "bg-primary/[0.02]",
                      isCanceled && "opacity-70"
                    )}
                  >
                    {canManage && (
                      <Avatar className="size-8 shrink-0">
                        <AvatarFallback className="bg-primary/10 text-primary text-xs">
                          {avatarInitial(o.playerName)}
                        </AvatarFallback>
                      </Avatar>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 truncate text-sm font-medium">
                        {canManage && (
                          <>
                            <span>{o.playerName}</span>
                            {o.depositPaid && (
                              <span className="inline-block size-2 rounded-full bg-green-500 shrink-0" title="已缴押金" />
                            )}
                            <span className="text-muted-foreground">·</span>
                          </>
                        )}
                        <span>{o.customerName}</span>
                        {o.discountCents > 0 && (
                          <Tag className="size-3 text-warning" />
                        )}
                      </div>
                      <div className="mt-1 grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-0.5 text-xs">
                        <div>
                          <span className="text-muted-foreground">时间 </span>
                          <span>{formatRelativeDateTime(o.startAt)}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">时长 </span>
                          <span className="font-medium">{formatDuration(o.durationMin)}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">单价 </span>
                          <span className="font-mono">{formatYuan(o.hourlyRateCents)}/h</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">{canManage ? "实付 " : "应得 "}</span>
                          <span className="font-mono font-medium">{canManage ? (isCanceled ? "—" : formatYuan(o.payableCents)) : formatYuan(payoutCents)}</span>
                        </div>
                        {canManage && (
                          <div>
                            <span className="text-muted-foreground">应得 </span>
                            <span className="font-mono text-success">{formatYuan(payoutCents)}</span>
                          </div>
                        )}
                        {canManage && o.dispatcherId !== o.playerId && (
                          <div>
                            <span className="text-muted-foreground">派单 </span>
                            <span>{o.dispatcherName}</span>
                          </div>
                        )}
                      </div>
                      {isCanceled && (o.cancelFault || o.cancelNote) && (
                        <div className="mt-1 truncate text-xs text-muted-foreground">
                          {o.cancelFault && faultLabel[o.cancelFault]}
                          {o.cancelFault && o.cancelNote && " · "}
                          {o.cancelNote}
                        </div>
                      )}
                    </div>
                    <OrderStatusGroup
                      orderStatus={o.orderStatus}
                      settleStatus={o.settleStatus}
                      hasCompensation={
                        isCanceled && o.playerCompensationCents > 0
                      }
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <OrderDetailSheet
        order={openOrder}
        role={role}
        myId={myId}
        onClose={() => setOpenId(null)}
      />

      {/* 批量结算对话框 */}
      <Dialog open={batchOpen} onOpenChange={setBatchOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>批量结算</DialogTitle>
            <DialogDescription>
              将全部待结算订单标记为已结算
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label>支付方式（可选）</Label>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={batchMethod === "WECHAT" ? "default" : "outline"}
                onClick={() => setBatchMethod(batchMethod === "WECHAT" ? undefined : "WECHAT")}
              >
                微信
              </Button>
              <Button
                size="sm"
                variant={batchMethod === "ALIPAY" ? "default" : "outline"}
                onClick={() => setBatchMethod(batchMethod === "ALIPAY" ? undefined : "ALIPAY")}
              >
                支付宝
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchOpen(false)} disabled={batchPending}>
              取消
            </Button>
            <Button onClick={handleBatchSettle} disabled={batchPending}>
              {batchPending ? <Loader2 className="size-4 animate-spin" /> : <CheckSquare className="size-4" />}
              确认结算
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function OrderDetailSheet({
  order,
  role,
  myId,
  onClose,
}: {
  order: OrderRow | null;
  role: Role;
  myId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [confirmUnsettle, setConfirmUnsettle] = useState(false);

  const canManage = role === "BOSS" || role === "STAFF";

  const hasDiscount = !!(order && order.discountCents > 0);
  const isCanceled = order?.orderStatus === "CANCELED";
  const payoutCents = order
    ? isCanceled
      ? order.playerCompensationCents
      : order.playerEarnCents
    : 0;
  // 已完成 / 已取消有补偿,且未结算 → 管理者可以打款
  const canSettleNow =
    !!order &&
    canManage &&
    order.settleStatus === "UNSETTLED" &&
    (order.orderStatus === "COMPLETED" ||
      (order.orderStatus === "CANCELED" && order.playerCompensationCents > 0));
  const showQrInContent =
    canSettleNow &&
    !!(order?.playerWechatQrPath || order?.playerAlipayQrPath);

  function run(
    fn: () => Promise<{ ok: boolean; error?: string }>,
    success: string
  ) {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        toast.error(res.error ?? "操作失败");
        return;
      }
      toast.success(success);
      onClose();
      router.refresh();
    });
  }

  return (
    <>
      <Sheet
        open={!!order && !cancelOpen && !adjustOpen}
        onOpenChange={(v) => !v && !cancelOpen && !adjustOpen && onClose()}
      >
        <SheetContent className="w-full sm:max-w-md flex flex-col gap-0 p-0">
          {order && (
            <>
              <SheetHeader className="border-b px-6 py-5">
                <div className="flex items-center gap-2">
                  <SheetTitle>订单详情</SheetTitle>
                  <OrderStatusBadge status={order.orderStatus} />
                </div>
                <SheetDescription>
                  {formatDateTime(order.startAt)}
                </SheetDescription>
              </SheetHeader>

              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                <div className="rounded-xl border bg-muted/30 p-5 text-center">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    {isCanceled ? "陪玩补偿" : "陪玩应得"}
                  </div>
                  <div
                    className={cn(
                      "mt-1 font-mono text-3xl font-semibold tabular-nums",
                      payoutCents > 0 ? "text-success" : "text-muted-foreground"
                    )}
                  >
                    {formatYuan(payoutCents)}
                  </div>
                  {!isCanceled && (
                    <div className="mt-2 flex justify-center gap-3 text-xs text-muted-foreground">
                      <span>
                        实付{" "}
                        <span className="font-mono">
                          {formatYuan(order.payableCents)}
                        </span>
                      </span>
                      <Separator orientation="vertical" className="h-3" />
                      <span>
                        抽成{" "}
                        <span className="font-mono">
                          {formatYuan(order.commissionCents)}
                        </span>
                      </span>
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  {canManage && (
                    <DetailRow label="陪玩" value={order.playerName} />
                  )}
                  <DetailRow
                    label="客户"
                    value={
                      <span>
                        {order.customerName}
                        <span className="ml-2 font-mono text-xs text-muted-foreground">
                          #{order.customerMemberNo}
                        </span>
                      </span>
                    }
                  />
                  {canManage && order.customerWechat && (
                    <DetailRow
                      label="微信"
                      value={
                        <span className="inline-flex items-center gap-1 font-mono">
                          <MessageCircle className="size-3 text-muted-foreground" />
                          {order.customerWechat}
                        </span>
                      }
                    />
                  )}
                  {canManage && order.dispatcherId !== order.playerId && (
                    <DetailRow label="派单人" value={order.dispatcherName} />
                  )}
                  <DetailRow
                    label="开始时间"
                    value={formatDateTime(order.startAt)}
                  />
                  <DetailRow
                    label="结束时间"
                    value={formatEndAt(order.startAt, order.durationMin)}
                  />
                  <DetailRow
                    label="时长"
                    value={formatDuration(order.durationMin)}
                  />
                  <DetailRow
                    label="单价"
                    value={`${formatYuan(order.hourlyRateCents)} / 小时`}
                  />
                  {canManage && hasDiscount && !isCanceled && (
                    <>
                      <DetailRow
                        label="原价"
                        value={formatYuan(order.originalCents)}
                      />
                      <DetailRow
                        label="优惠"
                        value={
                          <span className="text-warning">
                            −{formatYuan(order.discountCents)}
                          </span>
                        }
                      />
                    </>
                  )}
                  {!isCanceled && (
                    <DetailRow
                      label={hasDiscount ? "客户实付" : "金额"}
                      value={formatYuan(order.payableCents)}
                    />
                  )}
                  {canManage && !isCanceled && order.prepayUsedCents > 0 && (
                    <>
                      <DetailRow
                        label="预存抵扣"
                        value={
                          <span className="text-success">
                            -{formatYuan(order.prepayUsedCents)}
                          </span>
                        }
                      />
                      <DetailRow
                        label="还需支付"
                        value={formatYuan(
                          order.payableCents - order.prepayUsedCents
                        )}
                      />
                    </>
                  )}
                  {canManage && hasDiscount && !isCanceled && (
                    <DetailRow
                      label="店铺毛利"
                      value={
                        <span
                          className={
                            order.payableCents - order.playerEarnCents < 0
                              ? "text-destructive"
                              : ""
                          }
                        >
                          {formatYuan(order.payableCents - order.playerEarnCents)}
                        </span>
                      }
                    />
                  )}
                  {order.note && (
                    <DetailRow label="备注" value={order.note} />
                  )}
                  {order.completedAt && (
                    <DetailRow
                      label="完成时间"
                      value={formatDateTime(order.completedAt)}
                    />
                  )}
                  {isCanceled && order.cancelFault && (
                    <DetailRow
                      label="责任方"
                      value={
                        <Badge variant="outline">
                          {faultLabel[order.cancelFault]}
                        </Badge>
                      }
                    />
                  )}
                  {isCanceled && order.cancelNote && (
                    <DetailRow label="取消说明" value={order.cancelNote} />
                  )}
                  {order.canceledAt && (
                    <DetailRow
                      label="取消时间"
                      value={formatDateTime(order.canceledAt)}
                    />
                  )}
                  {order.settledAt && (
                    <DetailRow
                      label="结算时间"
                      value={formatDateTime(order.settledAt)}
                    />
                  )}
                  {order.paidMethod && (
                    <DetailRow
                      label="结算方式"
                      value={order.paidMethod === "WECHAT" ? "微信" : "支付宝"}
                    />
                  )}
                </div>

                {showQrInContent && (
                  <div className="space-y-2">
                    <div className="text-xs text-muted-foreground">
                      陪玩收款码
                    </div>
                    <div className="space-y-2 max-w-xs">
                      {order.playerWechatQrPath && (
                        <QrThumbnail
                          label="微信收款码"
                          path={order.playerWechatQrPath}
                        />
                      )}
                      {order.playerAlipayQrPath && (
                        <QrThumbnail
                          label="支付宝收款码"
                          path={order.playerAlipayQrPath}
                        />
                      )}
                    </div>
                  </div>
                )}
              </div>

              <ActionBar
                order={order}
                canManage={canManage}
                isOwnOrder={order.playerId === myId}
                pending={pending}
                onComplete={() =>
                  run(
                    () => completeOrderAction({ id: order.id }),
                    "已标记为完成"
                  )
                }
                onOpenCancel={() => setCancelOpen(true)}
                onAdjustDuration={() => setAdjustOpen(true)}
                onSettle={(method) =>
                  run(
                    () =>
                      settleOrderAction({ id: order.id, paidMethod: method }),
                    "已标记为已结"
                  )
                }
                onUnsettle={() => setConfirmUnsettle(true)}
              />
            </>
          )}
        </SheetContent>
      </Sheet>

      {order && cancelOpen && (
        <CancelDialog
          orderId={order.id}
          playerName={order.playerName}
          customerName={order.customerName}
          playerEarnCents={order.playerEarnCents}
          wasSettled={order.settleStatus === "SETTLED"}
          onClose={(succeeded) => {
            setCancelOpen(false);
            if (succeeded) {
              onClose();
              router.refresh();
            }
          }}
        />
      )}

      {order && adjustOpen && (
        <AdjustDurationDialog
          orderId={order.id}
          playerName={order.playerName}
          customerName={order.customerName}
          onClose={(succeeded) => {
            setAdjustOpen(false);
            if (succeeded) {
              onClose();
              router.refresh();
            }
          }}
        />
      )}

      <ConfirmDialog
        open={confirmUnsettle}
        onOpenChange={(open) => { if (!open) setConfirmUnsettle(false); }}
        onConfirm={() => {
          setConfirmUnsettle(false);
          if (order) run(() => unsettleOrderAction({ id: order.id }), "已撤销");
        }}
        title="撤销结算"
        description="撤销结算？该订单会回到待结算状态。"
        confirmLabel="撤销"
      />
    </>
  );
}

function ActionBar({
  order,
  canManage,
  isOwnOrder,
  pending,
  onComplete,
  onOpenCancel,
  onAdjustDuration,
  onSettle,
  onUnsettle,
}: {
  order: OrderRow;
  canManage: boolean;
  isOwnOrder: boolean;
  pending: boolean;
  onComplete: () => void;
  onOpenCancel: () => void;
  onAdjustDuration: () => void;
  onSettle: (method: PayMethod) => void;
  onUnsettle: () => void;
}) {
  if (order.orderStatus === "IN_PROGRESS") {
    const canComplete = canManage;
    if (!canComplete) return null;
    return (
      <div className="border-t px-6 py-4 space-y-2">
        {canComplete && (
          <Button className="w-full" onClick={onComplete} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
            标记已完成
          </Button>
        )}
        {canManage && (
          <Button
            variant="outline"
            className="w-full text-destructive hover:text-destructive"
            onClick={onOpenCancel}
            disabled={pending}
          >
            <XCircle /> 取消订单
          </Button>
        )}
      </div>
    );
  }

  // 已完成 待结算 / 已取消有补偿待结算
  const canSettleNow =
    order.settleStatus === "UNSETTLED" &&
    (order.orderStatus === "COMPLETED" ||
      (order.orderStatus === "CANCELED" && order.playerCompensationCents > 0));
  if (canSettleNow && canManage) {
    const amount =
      order.orderStatus === "CANCELED"
        ? order.playerCompensationCents
        : order.playerEarnCents;
    const hasQr = !!(order.playerWechatQrPath || order.playerAlipayQrPath);
    // 收款码已挪到内容区(详情之下),ActionBar 只保留打款按钮,
    // 避免在移动端竖屏挤掉「标记已打款」按钮。
    return (
      <div className="border-t px-6 py-4 space-y-2">
        {order.orderStatus === "COMPLETED" && (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-muted-foreground"
              onClick={onAdjustDuration}
              disabled={pending}
            >
              增加时长(如老板送单)
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-destructive hover:text-destructive"
              onClick={onOpenCancel}
              disabled={pending}
            >
              <XCircle /> 取消订单
            </Button>
          </>
        )}
        <p className="text-xs text-muted-foreground">
          {hasQr ? "扫码打款后,标记为已结:" : "线下打款后,标记为已结(陪玩还未上传收款码):"}
        </p>
        <div className="flex gap-2">
          <Button
            className="flex-1"
            onClick={() => onSettle("WECHAT")}
            disabled={pending}
          >
            {pending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
            微信付 {formatYuan(amount)}
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => onSettle("ALIPAY")}
            disabled={pending}
          >
            支付宝付 {formatYuan(amount)}
          </Button>
        </div>
      </div>
    );
  }

  // 已结算 — 仅 BOSS 可撤销/取消
  if (order.settleStatus === "SETTLED" && canManage) {
    return (
      <div className="border-t px-6 py-4 space-y-2">
        <Button
          variant="outline"
          className="w-full"
          onClick={onUnsettle}
          disabled={pending}
        >
          <RotateCcw /> 撤销结算
        </Button>
        {order.orderStatus !== "CANCELED" && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-destructive hover:text-destructive"
            onClick={onOpenCancel}
            disabled={pending}
          >
            <XCircle /> 取消订单
          </Button>
        )}
      </div>
    );
  }

  return null;
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b pb-2.5 last:border-0 last:pb-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right">{value}</span>
    </div>
  );
}

function QrThumbnail({ label, path }: { label: string; path: string }) {
  const [zoomOpen, setZoomOpen] = useState(false);
  return (
    <>
      <div className="rounded-lg border bg-card p-2">
        <div className="mb-1.5 text-center text-[11px] text-muted-foreground">
          {label}
        </div>
        <button
          type="button"
          onClick={() => setZoomOpen(true)}
          className="relative block w-full overflow-hidden rounded cursor-zoom-in group"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/uploads/${path}`}
            alt={label}
            className="aspect-square w-full rounded object-contain"
          />
          <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors">
            <ZoomIn className="size-6 text-white opacity-0 group-hover:opacity-90 transition-opacity" />
          </div>
        </button>
        <p className="mt-1 text-center text-[10px] text-muted-foreground">点击放大扫码</p>
      </div>
      <Dialog open={zoomOpen} onOpenChange={setZoomOpen}>
        <DialogContent className="max-w-lg sm:max-w-md p-2">
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
            <DialogDescription>用手机扫码向陪玩打款</DialogDescription>
          </DialogHeader>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/uploads/${path}`}
            alt={label}
            className="w-full object-contain rounded-lg"
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function CancelDialog({
  orderId,
  playerName,
  customerName,
  playerEarnCents,
  wasSettled,
  onClose,
}: {
  orderId: string;
  playerName: string;
  customerName: string;
  playerEarnCents: number;
  wasSettled: boolean;
  onClose: (succeeded: boolean) => void;
}) {
  const [fault, setFault] = useState<CancelFault>("OTHER");
  const [note, setNote] = useState("");
  // 根据责任方智能预填补偿:陪玩责任 = 0;客户/店里责任 = 原应得
  // 已结算订单:陪玩已收过钱,不再自动预填
  const [compensation, setCompensation] = useState("");
  const [pending, startTransition] = useTransition();

  function handleFaultChange(next: CancelFault) {
    setFault(next);
    if (wasSettled) return;
    // 切换责任方时,如果用户还没动过补偿输入,自动预填
    if (next === "PLAYER" || next === "OTHER") {
      setCompensation("");
    } else {
      setCompensation(centsToYuanString(playerEarnCents));
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await cancelOrderAction({
        id: orderId,
        fault,
        note: note || null,
        compensationYuan: compensation || undefined,
      });
      if (!res.ok) {
        toast.error(res.error ?? "取消失败");
        return;
      }
      toast.success("订单已取消");
      onClose(true);
    });
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>取消订单</DialogTitle>
          <DialogDescription>
            {playerName} · {customerName} · 原应得{" "}
            <span className="font-mono">{formatYuan(playerEarnCents)}</span>
            {wasSettled && " · 已付款"}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>责任方</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(
                ["PLAYER", "CUSTOMER", "SHOP", "OTHER"] as const
              ).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => handleFaultChange(f)}
                  className={cn(
                    "rounded-md border px-3 py-2 text-sm transition-colors",
                    fault === f
                      ? "border-primary bg-primary/10 text-primary"
                      : "hover:bg-accent"
                  )}
                >
                  {faultLabel[f]}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cancel-comp">陪玩补偿金额(元)</Label>
            <Input
              id="cancel-comp"
              type="number"
              step="0.01"
              min="0"
              max={centsToYuanString(playerEarnCents)}
              value={compensation}
              onChange={(e) => setCompensation(e.target.value)}
              placeholder="0(无补偿)"
            />
            <p className="text-xs text-muted-foreground">
              {wasSettled ? (
                "陪玩已收过原应得,通常填 0;如需额外追加再填写"
              ) : (
                <>
                  {fault === "PLAYER" && "陪玩责任 — 通常 0 补偿"}
                  {fault === "CUSTOMER" && "客户责任 — 通常按原应得补偿陪玩"}
                  {fault === "SHOP" && "店里责任 — 通常按原应得补偿陪玩"}
                  {fault === "OTHER" && "请根据实际情况填写,可为 0"}
                </>
              )}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cancel-note">取消说明(选填)</Label>
            <Input
              id="cancel-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              placeholder="比如:陪玩临时不到、客户改主意等"
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onClose(false)}
              disabled={pending}
            >
              不取消
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={pending}
            >
              {pending && <Loader2 className="animate-spin" />} 确认取消
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AdjustDurationDialog({
  orderId,
  playerName,
  customerName,
  onClose,
}: {
  orderId: string;
  playerName: string;
  customerName: string;
  onClose: (succeeded: boolean) => void;
}) {
  const [hours, setHours] = useState("");
  const [minutes, setMinutes] = useState("");
  const [note, setNote] = useState("老板送单");
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const h = parseInt(hours || "0", 10);
    const m = parseInt(minutes || "0", 10);
    const total = h * 60 + m;
    if (total <= 0) {
      toast.error("至少增加 1 分钟");
      return;
    }
    startTransition(async () => {
      const res = await adjustOrderDurationAction({
        id: orderId,
        extraMinutes: total,
        note: note || null,
      });
      if (!res.ok) {
        toast.error(res.error ?? "增加失败");
        return;
      }
      toast.success(`已增加 ${h > 0 ? `${h}h` : ""}${m > 0 ? `${m}min` : ""}`);
      onClose(true);
    });
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>增加时长</DialogTitle>
          <DialogDescription>
            {playerName} · {customerName} — 增加后会自动重算金额
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="adj-hours">增加小时</Label>
              <Input
                id="adj-hours"
                type="number"
                min="0"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="adj-minutes">增加分钟</Label>
              <Input
                id="adj-minutes"
                type="number"
                min="0"
                max="59"
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="adj-note">备注(选填)</Label>
            <Input
              id="adj-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              placeholder="例如:老板送单"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onClose(false)}
              disabled={pending}
            >
              取消
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />} 确认增加
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
