"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  Plus,
  Gift,
  Pencil,
  Trash2,
  Clock,
  CheckCircle2,
  Wallet,
  ZoomIn,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Pagination } from "@/components/pagination";

import { formatYuan, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { GIFT_TIER_CENTS } from "@/db/schema";
import { GIFT_TIER_LABELS, DEFAULT_GIFT_FEE_RATE_BP } from "@/lib/constants";
import { PlayerCombobox, type PlayerOption } from "@/components/player-combobox";
import {
  upsertGiftRecordAction,
  deleteGiftRecordAction,
  settleGiftAction,
  unsettleGiftAction,
} from "@/server/actions/gifts";

interface Props {
  players: PlayerOption[];
  records: GiftRecord[];
  total: number;
  pendingCount: number;
  page: number;
  pageSize: number;
  filter: {
    playerId: string;
    tier: string;
    tab: string;
    startAt: string;
    endAt: string;
  };
}

interface GiftRecord {
  id: string;
  playerId: string;
  playerName: string;
  playerWechatQrPath: string | null;
  playerAlipayQrPath: string | null;
  giftTierCents: number;
  quantity: number;
  totalCents: number;
  feeRateBp: number;
  platformFeeCents: number;
  playerEarnCents: number;
  senderNickname: string;
  note: string | null;
  operatorId: string;
  operatorName: string;
  submitterId: string;
  submitterName: string;
  settleStatus: "UNSETTLED" | "SETTLED";
  settledAt: string | null;
  paidMethod: "WECHAT" | "ALIPAY" | null;
  createdAt: string;
}

const GIFT_TIER_SET = new Set<number>(GIFT_TIER_CENTS);

const giftFormSchema = z.object({
  id: z.string().optional(),
  playerId: z.string().min(1, "请选择陪玩"),
  giftTierCents: z
    .number()
    .int()
    .refine((v) => GIFT_TIER_SET.has(v), "档位不合法"),
  quantity: z.coerce.number().int().min(1).max(999),
  senderNickname: z.string().trim().min(1, "请填写打赏人昵称").max(100),
  note: z.string().max(500).nullable(),
});

type GiftFormValues = z.infer<typeof giftFormSchema>;

const EMPTY_FORM: GiftFormValues = {
  playerId: "",
  giftTierCents: GIFT_TIER_CENTS[0],
  quantity: 1,
  senderNickname: "",
  note: "",
};

function PaginationFor({
  page,
  pageSize,
  total,
  filter,
}: {
  page: number;
  pageSize: number;
  total: number;
  filter: Props["filter"];
}) {
  const qs = new URLSearchParams();
  if (filter.playerId) qs.set("playerId", filter.playerId);
  if (filter.tier) qs.set("tier", filter.tier);
  if (filter.tab && filter.tab !== "pending") qs.set("tab", filter.tab);
  if (filter.startAt) qs.set("startAt", filter.startAt);
  if (filter.endAt) qs.set("endAt", filter.endAt);
  const baseHref = qs.toString() ? `/gifts?${qs.toString()}` : "/gifts";
  return (
    <Pagination page={page} pageSize={pageSize} total={total} baseHref={baseHref} />
  );
}

export function GiftsAdminClient({
  players,
  records,
  total,
  pendingCount,
  page,
  pageSize,
  filter,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<GiftRecord | null>(null);
  const [payTarget, setPayTarget] = useState<GiftRecord | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ type: "delete" | "unsettle"; id: string } | null>(null);

  const form = useForm<GiftFormValues>({
    resolver: zodResolver(giftFormSchema),
    defaultValues: EMPTY_FORM,
  });

  const giftTierCents = form.watch("giftTierCents");
  const quantity = form.watch("quantity");

  const preview = useMemo(() => {
    const totalCents = giftTierCents * (quantity || 1);
    const fee = Math.round((totalCents * DEFAULT_GIFT_FEE_RATE_BP) / 10000);
    return { total: totalCents, fee, earn: totalCents - fee };
  }, [giftTierCents, quantity]);

  function openNew() {
    setEditing(null);
    form.reset(EMPTY_FORM);
    setShowForm(true);
  }

  function openEdit(r: GiftRecord) {
    setEditing(r);
    form.reset({
      id: r.id,
      playerId: r.playerId,
      giftTierCents: r.giftTierCents,
      quantity: r.quantity,
      senderNickname: r.senderNickname,
      note: r.note ?? "",
    });
    setShowForm(true);
  }

  function onSubmit(values: GiftFormValues) {
    startTransition(async () => {
      const res = await upsertGiftRecordAction(values);
      if (res.ok) {
        toast.success(editing ? "已更新" : "已添加");
        setShowForm(false);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const res = await deleteGiftRecordAction({ id });
      if (res.ok) {
        toast.success("已删除");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
    setConfirmAction(null);
  }

  function doSettle(id: string, method: "WECHAT" | "ALIPAY") {
    startTransition(async () => {
      const res = await settleGiftAction({ id, paidMethod: method });
      if (res.ok) {
        toast.success("已标记为已支付");
        setPayTarget(null);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function doUnsettle(id: string) {
    startTransition(async () => {
      const res = await unsettleGiftAction({ id });
      if (res.ok) {
        toast.success("已撤销");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
    setConfirmAction(null);
  }

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  const currentTab = filter.tab || "pending";

  return (
    <>
      <PageHeader
        title="礼物记录"
        description="礼物报单的支付管理(独立于陪玩订单支付)"
        action={
          <Button onClick={openNew}>
            <Plus className="size-4" /> 新增
          </Button>
        }
      />

      {/* Tabs */}
      <div className="mb-4 inline-flex h-9 items-center justify-center rounded-lg bg-muted p-[3px]">
        {([
          { key: "pending", label: "待支付", count: pendingCount },
          { key: "settled", label: "已支付", count: null },
          { key: "all", label: "全部", count: null },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setParam("tab", t.key === "pending" ? "" : t.key)}
            className={cn(
              "inline-flex h-full items-center rounded-md px-4 text-sm font-medium transition-all gap-1.5",
              currentTab === t.key
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
            {t.count !== null && t.count > 0 && (
              <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-semibold text-white">
                {t.count > 99 ? "99+" : t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* 筛选 */}
      <Card className="mb-4 p-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
        <div>
          <Label className="text-xs">陪玩</Label>
          <PlayerCombobox
            className="mt-1"
            players={players}
            value={filter.playerId}
            onChange={(id) => setParam("playerId", id)}
            allowAll
          />
        </div>
        <div>
          <Label className="text-xs">档位</Label>
          <Select value={filter.tier} onValueChange={(v) => setParam("tier", v === "all" ? "" : v)}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="全部" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部</SelectItem>
              {GIFT_TIER_CENTS.map((t) => (
                <SelectItem key={t} value={String(t)}>
                  {GIFT_TIER_LABELS[t]} 元
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">开始日期</Label>
          <Input
            type="date"
            className="mt-1"
            value={filter.startAt}
            onChange={(e) => setParam("startAt", e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs">结束日期</Label>
          <Input
            type="date"
            className="mt-1"
            value={filter.endAt}
            onChange={(e) => setParam("endAt", e.target.value)}
          />
        </div>
      </Card>

      {/* 列表 */}
      {records.length === 0 ? (
        <EmptyState
          icon={<Gift />}
          title={
            currentTab === "pending"
              ? "没有待支付的报单"
              : currentTab === "settled"
              ? "没有已支付的记录"
              : "暂无礼物记录"
          }
        />
      ) : (
        <div className="space-y-2">
          {records.map((r) => {
            const isPending = r.settleStatus === "UNSETTLED";
            const hasQr = !!(r.playerWechatQrPath || r.playerAlipayQrPath);
            return (
              <Card key={r.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {isPending ? (
                        <Badge variant="outline" className="border-orange-400 text-orange-600">
                          <Clock className="size-3" /> 待支付
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-green-500 text-green-600">
                          <CheckCircle2 className="size-3" /> 已支付
                          {r.paidMethod && (
                            <span className="ml-1">
                              · {r.paidMethod === "WECHAT" ? "微信" : "支付宝"}
                            </span>
                          )}
                        </Badge>
                      )}
                      <Badge variant="default">
                        {GIFT_TIER_LABELS[r.giftTierCents] ?? r.giftTierCents / 100} 元
                      </Badge>
                      {r.quantity > 1 && (
                        <Badge variant="outline">× {r.quantity}</Badge>
                      )}
                      <span className="font-medium">{r.playerName}</span>
                      <span className="text-xs text-muted-foreground">
                        来自 {r.senderNickname}
                      </span>
                    </div>
                    <div className="text-sm font-mono tabular-nums text-muted-foreground">
                      总额 {formatYuan(r.totalCents)} · 平台抽{" "}
                      <span className="text-orange-600">
                        {formatYuan(r.platformFeeCents)}
                      </span>{" "}
                      · 陪玩到手{" "}
                      <span className="text-primary font-semibold">
                        {formatYuan(r.playerEarnCents)}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      报单 {formatDateTime(r.createdAt)} · 提交人 {r.submitterName}
                      {r.settledAt && (
                        <> · 支付于 {formatDateTime(r.settledAt)}</>
                      )}
                      {r.note && <> · 备注: {r.note}</>}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {isPending ? (
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => setPayTarget(r)}
                        disabled={!hasQr}
                        title={hasQr ? "" : "陪玩未上传收款码"}
                      >
                        <Wallet className="size-4" /> 支付
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setConfirmAction({ type: "unsettle", id: r.id })}
                        disabled={pending}
                        title="撤销支付"
                      >
                        <RotateCcw className="size-4" /> 撤销
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => openEdit(r)}
                      aria-label="编辑"
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => setConfirmAction({ type: "delete", id: r.id })}
                      aria-label="删除"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <PaginationFor
        page={page}
        pageSize={pageSize}
        total={total}
        filter={filter}
      />

      {/* 支付弹窗 */}
      {payTarget && (
        <PayDialog
          record={payTarget}
          pending={pending}
          onClose={() => setPayTarget(null)}
          onSettle={(method) => doSettle(payTarget.id, method)}
        />
      )}

      {/* 新增/编辑表单 */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "编辑礼物记录" : "新增礼物记录"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <div className="space-y-4">
              <FormField
                control={form.control}
                name="playerId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>陪玩 *</FormLabel>
                    <PlayerCombobox
                      className="mt-1"
                      players={players}
                      value={field.value}
                      onChange={field.onChange}
                      placeholder="搜索并选择陪玩…"
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="giftTierCents"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>礼物档位 *</FormLabel>
                    <div className="mt-1 grid grid-cols-3 gap-2 sm:grid-cols-6">
                      {GIFT_TIER_CENTS.map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => field.onChange(t)}
                          className={cn(
                            "rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                            field.value === t
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-input hover:bg-accent"
                          )}
                        >
                          {GIFT_TIER_LABELS[t]}
                        </button>
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>数量</FormLabel>
                    <FormControl>
                      <Input type="number" min={1} max={999} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="senderNickname"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>打赏人昵称 *</FormLabel>
                    <FormControl>
                      <Input placeholder="例如:抖音用户 xxx" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="note"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>备注</FormLabel>
                    <FormControl>
                      <textarea
                        className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm min-h-[60px] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 outline-none"
                        placeholder="选填"
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value)}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <Card className="bg-muted/50 p-3 text-sm font-mono tabular-nums">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">总额</span>
                  <span>{formatYuan(preview.total)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    平台抽成 ({(DEFAULT_GIFT_FEE_RATE_BP / 100).toFixed(0)}%)
                  </span>
                  <span className="text-orange-600">
                    − {formatYuan(preview.fee)}
                  </span>
                </div>
                <div className="mt-1 flex justify-between border-t pt-2 font-semibold">
                  <span>陪玩到手</span>
                  <span className="text-primary">{formatYuan(preview.earn)}</span>
                </div>
              </Card>
            </div>
          </Form>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowForm(false)}>
              取消
            </Button>
            <Button onClick={form.handleSubmit(onSubmit)} disabled={pending}>
              {editing ? "保存" : "添加"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!confirmAction}
        onOpenChange={(open) => { if (!open) setConfirmAction(null); }}
        onConfirm={() => {
          if (confirmAction?.type === "delete") remove(confirmAction.id);
          if (confirmAction?.type === "unsettle") doUnsettle(confirmAction.id);
        }}
        title={confirmAction?.type === "delete" ? "删除礼物记录" : "撤销支付"}
        description={confirmAction?.type === "delete" ? "确定删除此条礼物记录？" : "撤销支付？该报单会回到待支付状态。"}
        confirmLabel={confirmAction?.type === "delete" ? "删除" : "撤销"}
      />
    </>
  );
}

/* ============================ 支付弹窗 ============================ */

function PayDialog({
  record,
  pending,
  onClose,
  onSettle,
}: {
  record: GiftRecord;
  pending: boolean;
  onClose: () => void;
  onSettle: (method: "WECHAT" | "ALIPAY") => void;
}) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="size-5 text-primary" /> 支付礼物报单
          </DialogTitle>
          <DialogDescription>
            扫描 <span className="font-medium text-foreground">{record.playerName}</span> 的收款码,
            向陪玩打款 <span className="font-mono font-semibold text-primary">{formatYuan(record.playerEarnCents)}</span>
          </DialogDescription>
        </DialogHeader>

        <Card className="bg-muted/50 p-3 text-sm font-mono tabular-nums">
          <div className="flex justify-between">
            <span className="text-muted-foreground">礼物</span>
            <span>
              {GIFT_TIER_LABELS[record.giftTierCents] ?? record.giftTierCents / 100} 元
              {record.quantity > 1 && ` × ${record.quantity}`}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">送礼人</span>
            <span className="font-sans">{record.senderNickname}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">总额</span>
            <span>{formatYuan(record.totalCents)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">平台抽</span>
            <span className="text-orange-600">− {formatYuan(record.platformFeeCents)}</span>
          </div>
          <div className="mt-1 flex justify-between border-t pt-2 font-semibold">
            <span>陪玩到手</span>
            <span className="text-primary">{formatYuan(record.playerEarnCents)}</span>
          </div>
        </Card>

        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">陪玩收款码</div>
          <div className="grid grid-cols-2 gap-2">
            {record.playerWechatQrPath && (
              <QrThumbnail
                label="微信收款码"
                path={record.playerWechatQrPath}
              />
            )}
            {record.playerAlipayQrPath && (
              <QrThumbnail
                label="支付宝收款码"
                path={record.playerAlipayQrPath}
              />
            )}
            {!record.playerWechatQrPath && !record.playerAlipayQrPath && (
              <div className="col-span-2 text-center text-sm text-muted-foreground py-4">
                陪玩尚未上传收款码,请先让陪玩在「我的资料」上传
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            取消
          </Button>
          {record.playerWechatQrPath && (
            <Button
              variant="secondary"
              onClick={() => onSettle("WECHAT")}
              disabled={pending}
            >
              已用微信支付
            </Button>
          )}
          {record.playerAlipayQrPath && (
            <Button
              onClick={() => onSettle("ALIPAY")}
              disabled={pending}
            >
              已用支付宝支付
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
