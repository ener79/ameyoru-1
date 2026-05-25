"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, Loader2, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { computeOrder } from "@/lib/calc";
import {
  centsToYuanString,
  formatDuration,
  formatYuan,
  yuanStringToCents,
} from "@/lib/format";
import { DEFAULT_COMMISSION_PER_HOUR_CENTS } from "@/lib/constants";
import { createOrderAction } from "@/server/actions/orders";
import type { PlayerGender } from "@/db/schema";

interface Customer {
  id: string;
  name: string;
  memberNo: string;
  wechat: string | null;
  balanceCents: number;
}

interface Player {
  id: string;
  displayName: string;
  playerGender: PlayerGender | null;
  defaultRateCents: number | null;
}

const PRICE_BUCKETS: Record<PlayerGender, number[]> = {
  MALE: [3500, 4000, 4500, 5000],
  FEMALE: [4000, 4500, 5000, 5500],
};

export function OrderForm({
  isManager,
  players,
  recentCustomers,
}: {
  isManager: boolean;
  players: Player[];
  recentCustomers: Customer[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [playerId, setPlayerId] = useState(
    isManager ? "" : players[0]?.id ?? ""
  );
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerWechat, setCustomerWechat] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  useEffect(() => {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    setStartAt(local);
    setEndAt(local);
  }, []);
  const [rate, setRate] = useState("");
  const [discount, setDiscount] = useState("");
  const [usePrepay, setUsePrepay] = useState(false);
  const [note, setNote] = useState("");

  /** 切换陪玩时自动同步其默认单价 */
  function handlePlayerChange(newId: string) {
    setPlayerId(newId);
    const p = players.find((x) => x.id === newId);
    setRate(p?.defaultRateCents != null ? centsToYuanString(p.defaultRateCents) : "");
  }

  const computed = useMemo(() => {
    if (!startAt || !endAt) return null;
    const s = new Date(startAt);
    const e = new Date(endAt);
    if (isNaN(s.getTime()) || isNaN(e.getTime())) return null;
    const rateCents = yuanStringToCents(rate);
    if (rateCents <= 0) return null;
    const discountCents = discount ? yuanStringToCents(discount) : 0;
    const r = computeOrder({
      startAt: s,
      endAt: e,
      hourlyRateCents: rateCents,
      discountCents,
      commissionPerHourCents: DEFAULT_COMMISSION_PER_HOUR_CENTS,
    });
    if (r.durationMin <= 0) return null;
    return r;
  }, [startAt, endAt, rate, discount]);

  const crossDay = useMemo(() => {
    if (!startAt || !endAt) return false;
    return new Date(endAt).getTime() < new Date(startAt).getTime();
  }, [startAt, endAt]);

  const hasDiscount = !!(computed && computed.discountCents > 0);
  const isLoss = !!(computed && computed.shopProfitCents < 0);
  const selectedCustomer = useMemo(
    () => recentCustomers.find((c) => c.id === customerId) ?? null,
    [customerId, recentCustomers]
  );
  const prepayUsedCents =
    computed && isManager && usePrepay
      ? Math.min(selectedCustomer?.balanceCents ?? 0, computed.payableCents)
      : 0;
  const cashDueCents = computed ? computed.payableCents - prepayUsedCents : 0;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!customerName.trim()) {
      toast.error("请填写客户名");
      return;
    }
    if (isManager && !playerId) {
      toast.error("请选择陪玩");
      return;
    }
    if (!computed) {
      toast.error("时长或单价无效");
      return;
    }
    if (computed.discountCents > computed.originalCents) {
      toast.error("优惠不能超过原价");
      return;
    }
    const matchedCustomer =
      customerId && selectedCustomer?.name === customerName.trim()
        ? selectedCustomer
        : null;
    startTransition(async () => {
      const res = await createOrderAction({
        playerId: isManager ? playerId : undefined,
        customerId: matchedCustomer?.id,
        customerName: customerName.trim(),
        customerWechat: matchedCustomer
          ? undefined
          : customerWechat.trim() || undefined,
        startAt,
        endAt,
        hourlyRateYuan: rate,
        discountYuan: isManager && discount ? discount : undefined,
        usePrepay: isManager ? usePrepay : undefined,
        note: note || null,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      if (res.newCustomer) {
        toast.success(
          `已创建客户「${res.newCustomer.name}」,会员号 ${res.newCustomer.memberNo}`,
          { duration: 6000 }
        );
      } else {
        toast.success(isManager ? "派单成功" : "报单成功");
      }
      router.push("/orders");
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="grid gap-6 lg:grid-cols-[1fr_320px]"
    >
      <div className="space-y-4">
        {isManager && (
          <PlayerPicker
            players={players}
            selectedId={playerId}
            onSelect={handlePlayerChange}
          />
        )}

        <Card className="p-5 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="customer">客户(下单的老板)</Label>
            <Input
              id="customer"
              value={customerName}
              onChange={(e) => {
                setCustomerName(e.target.value);
                setCustomerId("");
                setUsePrepay(false);
              }}
              required
              autoFocus
            />
            {recentCustomers.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {recentCustomers.slice(0, 6).map((c) => (
                  <button
                    type="button"
                    key={c.id}
                    onClick={() => {
                      setCustomerId(c.id);
                      setCustomerName(c.name);
                      setCustomerWechat(c.wechat ?? "");
                      setUsePrepay(false);
                    }}
                    className={cn(
                      "rounded-full border bg-background px-2.5 py-0.5 text-xs transition-colors hover:bg-accent",
                      customerId === c.id &&
                        "border-primary bg-primary/10 text-primary"
                    )}
                  >
                    {c.name}
                    <span className="ml-1 font-mono text-muted-foreground">
                      #{c.memberNo}
                    </span>
                    {c.wechat && (
                      <span className="ml-1 font-mono text-muted-foreground">
                        {c.wechat}
                      </span>
                    )}
                    {c.balanceCents > 0 && (
                      <span className="ml-1 font-mono text-success">
                        {formatYuan(c.balanceCents)}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
            {!selectedCustomer && isManager && (
              <Input
                value={customerWechat}
                onChange={(e) => setCustomerWechat(e.target.value)}
                placeholder="客户微信(选填,用于区分同名老板)"
              />
            )}
            {isManager && selectedCustomer && (
              <label className="mt-3 flex items-start gap-2 rounded-lg border bg-muted/30 p-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 accent-primary"
                  checked={usePrepay}
                  onChange={(e) => setUsePrepay(e.target.checked)}
                  disabled={selectedCustomer.balanceCents <= 0}
                />
                <span className="min-w-0 flex-1">
                  <span className="font-medium">使用预存</span>
                  <span className="ml-2 font-mono text-success">
                    {formatYuan(selectedCustomer.balanceCents)}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    余额不足时自动混合支付,取消订单会退回已抵扣预存
                  </span>
                </span>
              </label>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="start">开始时间</Label>
              <Input
                id="start"
                type="datetime-local"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end">
                结束时间
                {crossDay && (
                  <Badge variant="warning" className="ml-1.5">
                    跨零点 +1天
                  </Badge>
                )}
              </Label>
              <Input
                id="end"
                type="datetime-local"
                value={endAt}
                onChange={(e) => setEndAt(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="rate">单价(元/小时)</Label>
              <Input
                id="rate"
                type="number"
                step="0.01"
                min="0"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                required
              />
            </div>
            {isManager && (
              <div className="space-y-2">
                <Label htmlFor="discount" className="flex items-center gap-1.5">
                  <Tag className="size-3.5 text-warning" />
                  优惠(元,选填)
                </Label>
                <Input
                  id="discount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="note">备注(选填)</Label>
            <Input
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </Card>
      </div>

      {/* 右侧:实时预览 */}
      <div className="space-y-3 lg:sticky lg:top-20 lg:self-start">
        <Card className="overflow-hidden">
          <div className="border-b bg-muted/40 px-5 py-3">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              实时计算
            </span>
          </div>
          <div className="space-y-3 p-5">
            <PreviewRow
              label="时长"
              value={computed ? formatDuration(computed.durationMin) : "—"}
            />
            <PreviewRow
              label="原价"
              value={computed ? formatYuan(computed.originalCents) : "—"}
              mono
            />
            {hasDiscount && (
              <PreviewRow
                label="优惠"
                value={
                  computed ? `-${formatYuan(computed.discountCents)}` : "—"
                }
                mono
                className="text-warning"
              />
            )}
            <PreviewRow
              label="实付"
              value={computed ? formatYuan(computed.payableCents) : "—"}
              mono
              bold
            />
            {isManager && prepayUsedCents > 0 && (
              <>
                <PreviewRow
                  label="预存抵扣"
                  value={`-${formatYuan(prepayUsedCents)}`}
                  mono
                  className="text-success"
                />
                <PreviewRow
                  label="还需支付"
                  value={formatYuan(cashDueCents)}
                  mono
                  bold
                />
              </>
            )}
            <Separator />
            <PreviewRow
              label="店铺抽成"
              value={computed ? formatYuan(computed.commissionCents) : "—"}
              mono
              muted
            />
            {isManager && hasDiscount && (
              <PreviewRow
                label="店铺毛利"
                value={computed ? formatYuan(computed.shopProfitCents) : "—"}
                mono
                className={isLoss ? "text-destructive" : "text-muted-foreground"}
              />
            )}
            <Separator />
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">陪玩应得</div>
              <div className="font-mono text-3xl font-semibold tabular-nums text-success">
                {computed ? formatYuan(computed.playerEarnCents) : "—"}
              </div>
              {hasDiscount && (
                <div className="text-xs text-muted-foreground">
                  按原价 ¥{centsToYuanString(computed?.originalCents)} 结算,陪玩不承担打折
                </div>
              )}
            </div>
          </div>
        </Card>

        <Button
          type="submit"
          className="w-full"
          size="lg"
          disabled={pending || !computed || (isManager && !playerId)}
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <>
              {isManager ? "派单" : "提交报单"}{" "}
              <ArrowRight className="size-4" />
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

function PlayerPicker({
  players,
  selectedId,
  onSelect,
}: {
  players: Player[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const grouped = {
    MALE: players.filter((p) => p.playerGender === "MALE"),
    FEMALE: players.filter((p) => p.playerGender === "FEMALE"),
    UNSET: players.filter((p) => !p.playerGender),
  };
  const selected = players.find((p) => p.id === selectedId);

  return (
    <Card className="p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Label>选择陪玩</Label>
          <div className="mt-1 text-xs text-muted-foreground">
            先看分类和价格,点名字即可派单
          </div>
        </div>
        {selected && (
          <Badge variant="secondary">
            已选 {selected.displayName}
          </Badge>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <PlayerPickerSection
          title="男陪"
          players={grouped.MALE}
          buckets={PRICE_BUCKETS.MALE}
          selectedId={selectedId}
          onSelect={onSelect}
        />
        <PlayerPickerSection
          title="女陪"
          players={grouped.FEMALE}
          buckets={PRICE_BUCKETS.FEMALE}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      </div>

      {grouped.UNSET.length > 0 && (
        <PlayerPickerSection
          title="未分类"
          players={grouped.UNSET}
          buckets={[3500, 4000, 4500, 5000, 5500]}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      )}
    </Card>
  );
}

function PlayerPickerSection({
  title,
  players,
  buckets,
  selectedId,
  onSelect,
}: {
  title: string;
  players: Player[];
  buckets: number[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const bucketSet = new Set(buckets);
  const otherPlayers = players.filter(
    (p) => p.defaultRateCents == null || !bucketSet.has(p.defaultRateCents)
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="text-sm font-semibold">{title}</div>
        <Badge variant="secondary">{players.length} 人</Badge>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {buckets.map((priceBucket) => (
          <PlayerPickerBucket
            key={`${title}-${priceBucket}`}
            label={`${formatYuan(priceBucket)}/h`}
            players={players.filter((p) => p.defaultRateCents === priceBucket)}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        ))}
        {otherPlayers.length > 0 && (
          <PlayerPickerBucket
            label="其他"
            players={otherPlayers}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        )}
      </div>
    </div>
  );
}

function PlayerPickerBucket({
  label,
  players,
  selectedId,
  onSelect,
}: {
  label: string;
  players: Player[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="rounded-lg border bg-background p-2">
      <div className="mb-2 px-1 font-mono text-xs font-semibold text-muted-foreground">
        {label}
      </div>
      {players.length === 0 ? (
        <div className="px-1 py-2 text-xs text-muted-foreground">暂无</div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {players.map((p) => {
            const selected = p.id === selectedId;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onSelect(p.id)}
                className={cn(
                  "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                  selected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-card hover:bg-accent"
                )}
              >
                {p.displayName}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PreviewRow({
  label,
  value,
  mono,
  muted,
  bold,
  className,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  muted?: boolean;
  bold?: boolean;
  className?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span
        className={cn(
          "text-base tabular-nums",
          bold ? "font-semibold" : "font-medium",
          mono && "font-mono",
          muted && "text-muted-foreground",
          className
        )}
      >
        {value}
      </span>
    </div>
  );
}
