"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Gift, Sparkles, Plus, Pencil, Trash2, Clock, CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PageHeader } from "@/components/page-header";
import { KpiCard } from "@/components/kpi-card";
import { EmptyState } from "@/components/empty-state";
import { formatYuan, formatRelativeDateTime } from "@/lib/format";
import { DEFAULT_GIFT_FEE_RATE_BP } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  upsertGiftRecordAction,
  deleteGiftRecordAction,
} from "@/server/actions/gifts";

interface GiftRecord {
  id: string;
  giftTierCents: number;
  giftName: string | null;
  giftTemplateId: string | null;
  quantity: number;
  totalCents: number;
  platformFeeCents: number;
  playerEarnCents: number;
  senderNickname: string;
  note: string | null;
  settleStatus: "UNSETTLED" | "SETTLED";
  settledAt: string | null;
  paidMethod: "WECHAT" | "ALIPAY" | null;
  submitterId: string;
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

interface GiftStats {
  today: { count: number; earn: number };
  month: { count: number; earn: number };
  total: { count: number; earn: number };
  pending: number;
}

interface GiftTemplateOption {
  id: string;
  name: string;
  priceCents: number;
}

interface Props {
  records: GiftRecord[];
  unread: UnreadRecord[];
  templates: GiftTemplateOption[];
  myId: string;
  tab: "all" | "pending" | "settled";
  stats: GiftStats;
}

const giftFormSchema = z.object({
  id: z.string().optional(),
  playerId: z.string(),
  giftTemplateId: z.string().min(1, "请选择礼物"),
  quantity: z.coerce.number().int().min(1).max(999),
  senderNickname: z.string().trim().min(1, "请填写打赏人昵称").max(100),
  note: z.string().max(500).nullable(),
});

type GiftFormValues = z.infer<typeof giftFormSchema>;

export function MyGiftsClient({ records, unread, templates, myId, tab, stats }: Props) {
  const router = useRouter();
  const [popupOpen, setPopupOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<GiftRecord | null>(null);
  const [pending, startTransition] = useTransition();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const emptyForm: GiftFormValues = {
    playerId: myId,
    giftTemplateId: "",
    quantity: 1,
    senderNickname: "",
    note: "",
  };

  const form = useForm<GiftFormValues>({
    resolver: zodResolver(giftFormSchema),
    defaultValues: emptyForm,
  });

  const giftTemplateId = form.watch("giftTemplateId");
  const quantity = form.watch("quantity");

  useEffect(() => {
    if (unread.length > 0) setPopupOpen(true);
  }, [unread.length]);

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === giftTemplateId),
    [templates, giftTemplateId]
  );

  const preview = useMemo(() => {
    const priceCents = selectedTemplate?.priceCents ?? 0;
    const totalCents = priceCents * (quantity || 1);
    const fee = Math.round((totalCents * DEFAULT_GIFT_FEE_RATE_BP) / 10000);
    return { total: totalCents, fee, earn: totalCents - fee };
  }, [selectedTemplate, quantity]);

  function changeTab(t: "all" | "pending" | "settled") {
    router.push(t === "all" ? "/my-gifts" : `/my-gifts?tab=${t}`);
  }

  function openNew() {
    setEditing(null);
    form.reset(emptyForm);
    setFormOpen(true);
  }

  function openEdit(r: GiftRecord) {
    setEditing(r);
    form.reset({
      id: r.id,
      playerId: myId,
      giftTemplateId: r.giftTemplateId ?? "",
      quantity: r.quantity,
      senderNickname: r.senderNickname,
      note: r.note ?? "",
    });
    setFormOpen(true);
  }

  function onSubmit(values: GiftFormValues) {
    startTransition(async () => {
      const res = await upsertGiftRecordAction(values);
      if (res.ok) {
        toast.success(editing ? "已更新" : "已提交,等待管理员支付");
        setFormOpen(false);
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
    setConfirmDeleteId(null);
  }

  return (
    <>
      <PageHeader
        title="礼物收入"
        description="外部平台打赏礼物,自己报单 → 管理员支付"
        action={
          <Button onClick={openNew}>
            <Plus className="size-4" /> 新增报单
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="待支付"
          value={String(stats.pending)}
          hint="管理员处理中"
        />
        <KpiCard
          label="今日已收"
          value={formatYuan(stats.today.earn)}
          hint={`今日 ${stats.today.count} 单`}
          emphasis
        />
        <KpiCard
          label="本月已收"
          value={formatYuan(stats.month.earn)}
          hint={`本月 ${stats.month.count} 单`}
        />
        <KpiCard
          label="累计已收"
          value={formatYuan(stats.total.earn)}
          hint={`共 ${stats.total.count} 单`}
        />
      </div>

      {/* Tabs */}
      <div className="mt-6 mb-4 inline-flex h-9 items-center justify-center rounded-lg bg-muted p-[3px]">
        {(["all", "pending", "settled"] as const).map((t) => (
          <button
            key={t}
            onClick={() => changeTab(t)}
            className={cn(
              "inline-flex h-full items-center rounded-md px-4 text-sm font-medium transition-all",
              tab === t
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t === "all" ? "全部" : t === "pending" ? `待支付${stats.pending > 0 ? ` (${stats.pending})` : ""}` : "已支付"}
          </button>
        ))}
      </div>

      <div>
        {records.length === 0 ? (
          <EmptyState
            icon={<Gift />}
            title={
              tab === "pending"
                ? "没有待支付的报单"
                : tab === "settled"
                ? "还没有已支付的礼物"
                : "还没有礼物记录"
            }
            description={
              tab === "all"
                ? "点击右上角「新增报单」提交礼物报单"
                : undefined
            }
          />
        ) : (
          <div className="space-y-2">
            {records.map((r) => {
              const isPending = r.settleStatus === "UNSETTLED";
              const canEdit = isPending && r.submitterId === myId;
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
                          </Badge>
                        )}
                        <Gift className="size-4 text-pink-500" />
                        <Badge variant="default">
                          {r.giftName ?? r.giftTierCents / 100} 元
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
                        {r.settledAt && (
                          <>
                            {" · 支付于 "}
                            {formatRelativeDateTime(r.settledAt)}
                            {r.paidMethod && (
                              <> ({r.paidMethod === "WECHAT" ? "微信" : "支付宝"})</>
                            )}
                          </>
                        )}
                        {r.note && <> · {r.note}</>}
                      </div>
                    </div>
                    {canEdit && (
                      <div className="flex gap-1 shrink-0">
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
                          onClick={() => setConfirmDeleteId(r.id)}
                          aria-label="删除"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* 新增/编辑表单 */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "编辑报单" : "新增礼物报单"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <div className="space-y-4">
              <FormField
                control={form.control}
                name="giftTemplateId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>礼物 *</FormLabel>
                    <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {templates.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => field.onChange(t.id)}
                          className={cn(
                            "rounded-md border px-3 py-2 text-sm font-medium transition-colors text-left",
                            field.value === t.id
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-input hover:bg-accent"
                          )}
                        >
                          <div>{t.name}</div>
                          <div className="text-xs text-muted-foreground">{t.priceCents / 100}元</div>
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
                  <span>你到手</span>
                  <span className="text-primary">{formatYuan(preview.earn)}</span>
                </div>
              </Card>
            </div>
          </Form>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setFormOpen(false)}>
              取消
            </Button>
            <Button onClick={form.handleSubmit(onSubmit)} disabled={pending}>
              {editing ? "保存" : "提交报单"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            {unread.map((u) => (
                <Card key={u.id} className="bg-pink-50/50 p-3 dark:bg-pink-950/20">
                  <div className="text-sm">
                    <span className="font-semibold">{u.senderNickname}</span>
                    {" 送了你 "}
                    <span className="font-semibold text-pink-600">
                      {u.giftTierCents / 100} 元
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
              ))}
          </div>
          <DialogFooter>
            <Button onClick={() => setPopupOpen(false)}>知道了</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!confirmDeleteId}
        onOpenChange={(open) => { if (!open) setConfirmDeleteId(null); }}
        onConfirm={() => confirmDeleteId && remove(confirmDeleteId)}
        title="删除报单"
        description="确定删除此条报单？"
        confirmLabel="删除"
      />
    </>
  );
}
