"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { toast } from "sonner";
import { Plus, Gift, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Pagination } from "@/components/pagination";

import { formatYuan, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { GIFT_TIER_CENTS } from "@/db/schema";
import { GIFT_TIER_LABELS, DEFAULT_GIFT_FEE_RATE_BP } from "@/lib/constants";
import {
  upsertGiftRecordAction,
  deleteGiftRecordAction,
  type UpsertGiftRecordInput,
} from "@/server/actions/gifts";

interface PlayerOpt {
  id: string;
  name: string;
  username: string | null;
  active: boolean;
}

interface Record {
  id: string;
  playerId: string;
  playerName: string;
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
  createdAt: string;
}

interface Props {
  players: PlayerOpt[];
  records: Record[];
  total: number;
  page: number;
  pageSize: number;
  filter: {
    playerId: string;
    tier: string;
    startAt: string;
    endAt: string;
  };
}

const EMPTY_FORM: UpsertGiftRecordInput = {
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
  page,
  pageSize,
  filter,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Record | null>(null);
  const [form, setForm] = useState<UpsertGiftRecordInput>(EMPTY_FORM);

  const preview = useMemo(() => {
    const total = form.giftTierCents * form.quantity;
    const fee = Math.round((total * DEFAULT_GIFT_FEE_RATE_BP) / 10000);
    return { total, fee, earn: total - fee };
  }, [form.giftTierCents, form.quantity]);

  function openNew() {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setShowForm(true);
  }

  function openEdit(r: Record) {
    setEditing(r);
    setForm({
      id: r.id,
      playerId: r.playerId,
      giftTierCents: r.giftTierCents,
      quantity: r.quantity,
      senderNickname: r.senderNickname,
      note: r.note ?? "",
    });
    setShowForm(true);
  }

  function submit() {
    if (!form.playerId) {
      toast.error("请选择陪玩");
      return;
    }
    if (!form.senderNickname.trim()) {
      toast.error("请填写打赏人昵称");
      return;
    }
    startTransition(async () => {
      const res = await upsertGiftRecordAction(form);
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
    if (!confirm("确定删除此条礼物记录？")) return;
    startTransition(async () => {
      const res = await deleteGiftRecordAction({ id });
      if (res.ok) {
        toast.success("已删除");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function setFilterParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <>
      <PageHeader
        title="礼物记录"
        description="记录外部平台打赏礼物的抽成与陪玩收入"
        action={
          <Button onClick={openNew}>
            <Plus className="size-4" /> 新增
          </Button>
        }
      />

      {/* 筛选 */}
      <Card className="mb-4 p-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
        <div>
          <Label className="text-xs">陪玩</Label>
          <select
            className="mt-1 w-full rounded border px-3 py-2 text-sm"
            value={filter.playerId}
            onChange={(e) => setFilterParam("playerId", e.target.value)}
          >
            <option value="">全部</option>
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {!p.active ? "(已停用)" : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-xs">档位</Label>
          <select
            className="mt-1 w-full rounded border px-3 py-2 text-sm"
            value={filter.tier}
            onChange={(e) => setFilterParam("tier", e.target.value)}
          >
            <option value="">全部</option>
            {GIFT_TIER_CENTS.map((t) => (
              <option key={t} value={t}>
                {GIFT_TIER_LABELS[t]} 元
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-xs">开始日期</Label>
          <Input
            type="date"
            className="mt-1"
            value={filter.startAt}
            onChange={(e) => setFilterParam("startAt", e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs">结束日期</Label>
          <Input
            type="date"
            className="mt-1"
            value={filter.endAt}
            onChange={(e) => setFilterParam("endAt", e.target.value)}
          />
        </div>
      </Card>

      {/* 列表 */}
      {records.length === 0 ? (
        <EmptyState icon={<Gift />} title="暂无礼物记录" />
      ) : (
        <div className="space-y-2">
          {records.map((r) => (
            <Card key={r.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
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
                    <span className="text-primary">
                      {formatYuan(r.playerEarnCents)}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatDateTime(r.createdAt)} · 操作人 {r.operatorName}
                    {r.note && <> · 备注: {r.note}</>}
                  </div>
                </div>
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
                    onClick={() => remove(r.id)}
                    aria-label="删除"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <PaginationFor
        page={page}
        pageSize={pageSize}
        total={total}
        filter={filter}
      />

      {/* 新增/编辑表单 */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "编辑礼物记录" : "新增礼物记录"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>陪玩 *</Label>
              <select
                className="mt-1 w-full rounded border px-3 py-2 text-sm"
                value={form.playerId}
                onChange={(e) => setForm({ ...form, playerId: e.target.value })}
              >
                <option value="">请选择陪玩…</option>
                {players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {!p.active ? "(已停用)" : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label>礼物档位 *</Label>
              <div className="mt-1 grid grid-cols-3 gap-2 sm:grid-cols-6">
                {GIFT_TIER_CENTS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setForm({ ...form, giftTierCents: t })}
                    className={cn(
                      "rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                      form.giftTierCents === t
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-input hover:bg-accent"
                    )}
                  >
                    {GIFT_TIER_LABELS[t]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label>数量</Label>
              <Input
                type="number"
                min={1}
                max={999}
                className="mt-1"
                value={form.quantity}
                onChange={(e) =>
                  setForm({
                    ...form,
                    quantity: Math.max(1, Math.min(999, Number(e.target.value) || 1)),
                  })
                }
              />
            </div>

            <div>
              <Label>打赏人昵称 *</Label>
              <Input
                className="mt-1"
                placeholder="例如:抖音用户 xxx"
                value={form.senderNickname}
                onChange={(e) => setForm({ ...form, senderNickname: e.target.value })}
              />
            </div>

            <div>
              <Label>备注</Label>
              <textarea
                className="mt-1 w-full rounded border px-3 py-2 text-sm min-h-[60px]"
                placeholder="选填"
                value={form.note ?? ""}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
              />
            </div>

            {/* 实时预览 */}
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
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowForm(false)}>
              取消
            </Button>
            <Button onClick={submit} disabled={pending}>
              {editing ? "保存" : "添加"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
