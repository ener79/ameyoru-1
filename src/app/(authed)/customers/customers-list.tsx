"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Check,
  FileText,
  GitMerge,
  Loader2,
  MessageCircle,
  MinusCircle,
  MoreHorizontal,
  Pencil,
  Trash2,
  WalletCards,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { avatarInitial, formatDuration, formatYuan } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  addCustomerDepositAction,
  deductCustomerBalanceAction,
  deleteCustomerAction,
  getCustomerLedgerAction,
  mergeCustomersAction,
  searchCustomersAction,
  updateCustomerAction,
} from "@/server/actions/customers";
import type { CustomerBalanceTxnType, OrderStatus } from "@/db/schema";

interface CustomerRow {
  id: string;
  name: string;
  memberNo: string;
  wechat: string | null;
  note: string | null;
  orderCount: number;
  payableCents: number;
  durationMin: number;
  balanceCents: number;
}

interface PlayerOption {
  id: string;
  name: string;
  username: string;
}

type CustomerBalanceLedgerRow = {
  kind: "BALANCE";
  id: string;
  txnId: string;
  type: CustomerBalanceTxnType;
  amountCents: number;
  note: string | null;
  createdAt: string;
  occurredAt: string;
  actorName: string;
  orderId: string | null;
  orderStartAt: string | null;
  orderPayableCents: number | null;
  playerNames: string[] | null;
};

type CustomerOrderLedgerRow = {
  kind: "ORDER";
  id: string;
  orderId: string;
  createdAt: string;
  occurredAt: string;
  startAt: string;
  durationMin: number;
  payableCents: number;
  prepayUsedCents: number;
  discountCents: number;
  orderStatus: OrderStatus;
  note: string | null;
  playerName: string;
  dispatcherName: string;
};

type CustomerLedgerRow = CustomerBalanceLedgerRow | CustomerOrderLedgerRow;

export function CustomersList({
  customers,
  players,
  startIndex,
}: {
  customers: CustomerRow[];
  players: PlayerOption[];
  startIndex: number;
}) {
  const [editing, setEditing] = useState<CustomerRow | null>(null);
  const [depositing, setDepositing] = useState<CustomerRow | null>(null);
  const [deducting, setDeducting] = useState<CustomerRow | null>(null);
  const [merging, setMerging] = useState<CustomerRow | null>(null);
  const [deleting, setDeleting] = useState<CustomerRow | null>(null);
  const [ledgerCustomer, setLedgerCustomer] = useState<CustomerRow | null>(null);

  return (
    <>
      <Card className="overflow-hidden p-0">
        <ul className="divide-y">
          {customers.map((c, i) => (
            <li
              key={c.id}
              className="flex flex-col gap-3 px-4 py-3 hover:bg-accent/40 sm:flex-row sm:items-center"
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-md font-mono text-sm font-medium tabular-nums text-muted-foreground">
                  {startIndex + i + 1}
                </span>
                <Avatar className="size-9 shrink-0">
                  <AvatarFallback className="bg-muted text-foreground text-xs">
                    {avatarInitial(c.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <span className="truncate">{c.name}</span>
                    {c.orderCount >= 10 && (
                      <Badge className="border-transparent bg-gradient-to-br from-rank-gold-from to-rank-gold-to text-white text-[10px]">
                        VIP
                      </Badge>
                    )}
                    {c.orderCount >= 2 && c.orderCount < 10 && (
                      <Badge variant="success" className="text-[10px]">
                        回头客
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    {c.wechat && (
                      <span className="inline-flex items-center gap-0.5 font-mono">
                        <MessageCircle className="size-3" />
                        {c.wechat}
                      </span>
                    )}
                    {c.note && <span className="truncate">{c.note}</span>}
                    <span className="font-mono opacity-50">#{c.memberNo}</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono text-sm font-medium tabular-nums">
                    {formatYuan(c.payableCents)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {c.orderCount} 单
                    {c.durationMin > 0 && ` · ${formatDuration(c.durationMin)}`}
                  </div>
                  {c.balanceCents > 0 && (
                    <div className="font-mono text-xs tabular-nums text-success">
                      预存余额 {formatYuan(c.balanceCents)}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 sm:gap-2">
                <Button
                  variant={c.balanceCents > 0 ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => setDepositing(c)}
                  className="flex-1 sm:flex-none"
                >
                  <WalletCards />
                  充值预存
                </Button>
                {c.balanceCents > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDeducting(c)}
                    className="flex-1 sm:flex-none"
                  >
                    <MinusCircle />
                    扣减
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setLedgerCustomer(c)}
                  className="flex-1 sm:flex-none"
                >
                  <FileText />
                  查看流水
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label="更多操作">
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    <DropdownMenuItem onClick={() => setEditing(c)}>
                      <Pencil /> 编辑
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setMerging(c)}>
                      <GitMerge /> 合并客户
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => setDeleting(c)}
                    >
                      <Trash2 /> 删除客户
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {/* key={editing.id} 确保每次切换客户都重置表单 state */}
      {editing && (
        <EditCustomerDialog
          key={editing.id}
          customer={editing}
          onClose={() => setEditing(null)}
        />
      )}

      {depositing && (
        <DepositDialog
          key={depositing.id}
          customer={depositing}
          onClose={() => setDepositing(null)}
        />
      )}

      {deducting && (
        <DeductDialog
          key={deducting.id}
          customer={deducting}
          players={players}
          onClose={() => setDeducting(null)}
        />
      )}

      {merging && (
        <MergeDialog
          key={merging.id}
          customer={merging}
          onClose={() => setMerging(null)}
        />
      )}

      {deleting && (
        <DeleteCustomerDialog
          key={deleting.id}
          customer={deleting}
          onClose={() => setDeleting(null)}
        />
      )}

      {ledgerCustomer && (
        <CustomerLedgerDialog
          key={ledgerCustomer.id}
          customer={ledgerCustomer}
          onClose={() => setLedgerCustomer(null)}
        />
      )}
    </>
  );
}

function EditCustomerDialog({
  customer,
  onClose,
}: {
  customer: CustomerRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(customer.name);
  const [wechat, setWechat] = useState(customer.wechat ?? "");
  const [note, setNote] = useState(customer.note ?? "");
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await updateCustomerAction({
        id: customer.id,
        name: name.trim(),
        wechat: wechat.trim() || null,
        note: note.trim() || null,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("已保存");
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>编辑客户</DialogTitle>
          <DialogDescription>
            会员号 <span className="font-mono">{customer.memberNo}</span>{" "}
            自动生成,不可改
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cust-name">客户名</Label>
            <Input
              id="cust-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cust-wechat">微信号(仅老板/员工可见)</Label>
            <Input
              id="cust-wechat"
              value={wechat}
              onChange={(e) => setWechat(e.target.value)}
              placeholder="客户微信号"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cust-note">备注</Label>
            <Input
              id="cust-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="比如:重要客户、易取消等"
              maxLength={200}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />} 保存
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DepositDialog({
  customer,
  onClose,
}: {
  customer: CustomerRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await addCustomerDepositAction({
        customerId: customer.id,
        amountYuan: amount,
        note: note.trim() || null,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("预存已入账");
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>充值预存</DialogTitle>
          <DialogDescription>
            {customer.name} · 当前预存余额{" "}
            <span className="font-mono">
              {formatYuan(customer.balanceCents)}
            </span>
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="deposit-amount">充值金额(元)</Label>
            <Input
              id="deposit-amount"
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="100"
              required
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="deposit-note">备注(选填)</Label>
            <Input
              id="deposit-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="比如:微信转账、线下收款"
              maxLength={200}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              确认充值
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const txnLabel: Record<CustomerBalanceTxnType, string> = {
  DEPOSIT: "充值",
  ORDER_DEBIT: "预存变动 · 订单抵扣",
  ORDER_REFUND: "预存变动 · 取消退回",
  MANUAL_DEDUCT: "预存扣减(老板提取)",
  SERVICE_DEDUCT: "扣款",
  REVERSAL: "回撤",
};

function DeductDialog({
  customer,
  players,
  onClose,
}: {
  customer: CustomerRow;
  players: PlayerOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  function togglePlayer(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selectedIds.size === 0) {
      toast.error("请至少选一个陪玩");
      return;
    }
    startTransition(async () => {
      const res = await deductCustomerBalanceAction({
        customerId: customer.id,
        amountYuan: amount,
        playerIds: Array.from(selectedIds),
        note: note.trim() || null,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("已扣减预存余额");
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>扣减预存余额</DialogTitle>
          <DialogDescription>
            {customer.name} · 当前预存余额{" "}
            <span className="font-mono">
              {formatYuan(customer.balanceCents)}
            </span>
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="deduct-amount">扣减金额(元)</Label>
            <Input
              id="deduct-amount"
              type="number"
              step="0.01"
              min="0.01"
              max={(customer.balanceCents / 100).toFixed(2)}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="100"
              required
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label>关联陪玩(可多选)</Label>
            {players.length === 0 ? (
              <p className="text-sm text-muted-foreground">暂无在职陪玩</p>
            ) : (
              <div className="max-h-48 overflow-y-auto rounded-md border">
                <ul className="divide-y">
                  {players.map((p) => {
                    const checked = selectedIds.has(p.id);
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => togglePlayer(p.id)}
                          className={cn(
                            "flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
                            checked && "bg-primary/10"
                          )}
                        >
                          <span
                            className={cn(
                              "flex size-4 shrink-0 items-center justify-center rounded border",
                              checked
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-input"
                            )}
                          >
                            {checked && <Check className="size-3" />}
                          </span>
                          <span className="flex-1 truncate">{p.name}</span>
                          {p.username && (
                            <span className="font-mono text-xs text-muted-foreground">
                              @{p.username}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              已选 {selectedIds.size} 人
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="deduct-note">备注(选填)</Label>
            <Input
              id="deduct-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="比如:陪玩私下接单 / 私单线下结清"
              maxLength={200}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={pending}
            >
              取消
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              确认扣减
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MergeDialog({
  customer,
  onClose,
}: {
  customer: CustomerRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CustomerRow[]>([]);
  const [searching, setSearching] = useState(false);
  // 已选客户快照:合并预览不依赖当前搜索结果,翻找其它关键词也不丢
  const [selected, setSelected] = useState<Map<string, CustomerRow>>(new Map());
  const [pending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      const rows = await searchCustomersAction({ q: query.trim() });
      setResults(
        rows
          .filter((r) => r.customerId !== customer.id)
          .map((r) => ({
            id: r.customerId,
            name: r.name,
            memberNo: r.memberNo,
            wechat: r.wechat,
            note: r.note,
            orderCount: r.orderCount,
            payableCents: r.payableCents,
            durationMin: r.durationMin,
            balanceCents: r.balanceCents,
          }))
      );
      setSearching(false);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, customer.id]);

  const selectedCustomers = Array.from(selected.values());
  const addedOrders = selectedCustomers.reduce((s, c) => s + c.orderCount, 0);
  const addedDuration = selectedCustomers.reduce((s, c) => s + c.durationMin, 0);
  const addedBalance = selectedCustomers.reduce((s, c) => s + c.balanceCents, 0);

  function toggle(c: CustomerRow) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(c.id)) next.delete(c.id);
      else next.set(c.id, c);
      return next;
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selected.size === 0) {
      toast.error("请至少选一个要合并的客户");
      return;
    }
    startTransition(async () => {
      const res = await mergeCustomersAction({
        primaryId: customer.id,
        mergeIds: Array.from(selected.keys()),
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`已合并 ${res.mergedCount} 个客户`);
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>合并客户</DialogTitle>
          <DialogDescription>
            把其它客户合并到 <span className="font-medium">{customer.name}</span>
            。被合并客户的订单、流水、余额都会归到这里,然后删除。不可撤销。
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="merge-search">搜索要合并的客户</Label>
            <Input
              id="merge-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="按名字 / 微信 / 会员号搜索"
              autoFocus
            />
          </div>

          <div className="max-h-64 overflow-y-auto rounded-md border">
            {searching ? (
              <div className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
                <Loader2 className="animate-spin size-4" /> 搜索中
              </div>
            ) : results.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">没有匹配的客户</p>
            ) : (
              <ul className="divide-y">
                {results.map((c) => {
                  const checked = selected.has(c.id);
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => toggle(c)}
                        className={cn(
                          "flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
                          checked && "bg-primary/10"
                        )}
                      >
                        <span
                          className={cn(
                            "flex size-4 shrink-0 items-center justify-center rounded border",
                            checked
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-input"
                          )}
                        >
                          {checked && <Check className="size-3" />}
                        </span>
                        <span className="flex-1 truncate">{c.name}</span>
                        <span className="font-mono text-xs text-muted-foreground opacity-60">
                          #{c.memberNo}
                        </span>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {c.orderCount} 单
                        </span>
                        {c.balanceCents > 0 && (
                          <span className="font-mono text-xs tabular-nums text-success">
                            {formatYuan(c.balanceCents)}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {selected.size > 0 && (
            <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
              已选 {selected.size} 人,合并后:
              <span className="ml-1 font-medium text-foreground">
                {customer.name}
              </span>{" "}
              共{" "}
              <span className="font-mono tabular-nums">
                {customer.orderCount + addedOrders}
              </span>{" "}
              单 ·{" "}
              <span className="font-mono tabular-nums">
                {formatDuration(customer.durationMin + addedDuration)}
              </span>{" "}
              · 余额{" "}
              <span className="font-mono tabular-nums">
                {formatYuan(customer.balanceCents + addedBalance)}
              </span>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={pending}
            >
              取消
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={pending || selected.size === 0}
            >
              {pending && <Loader2 className="animate-spin" />}
              确认合并
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteCustomerDialog({
  customer,
  onClose,
}: {
  customer: CustomerRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      const res = await deleteCustomerAction({ id: customer.id });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("已删除客户");
      onClose();
      router.refresh();
    });
  }

  const hasRefs = customer.orderCount > 0 || customer.balanceCents !== 0;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>删除客户</DialogTitle>
          <DialogDescription>
            确认删除 <span className="font-medium">{customer.name}</span>?此操作不可撤销。
          </DialogDescription>
        </DialogHeader>
        {hasRefs && (
          <p className="text-sm text-destructive">
            该客户已有订单或预存流水,无法删除。如有重复请用合并。
          </p>
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={pending}
          >
            取消
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleConfirm}
            disabled={pending || hasRefs}
          >
            {pending && <Loader2 className="animate-spin" />}
            确认删除
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const orderStatusLabel: Record<OrderStatus, string> = {
  IN_PROGRESS: "进行中",
  COMPLETED: "已完成",
  CANCELED: "已取消",
};

function CustomerLedgerDialog({
  customer,
  onClose,
}: {
  customer: CustomerRow;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<CustomerLedgerRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      const res = await getCustomerLedgerAction({ customerId: customer.id });
      if (!res.ok) {
        setError("error" in res ? String(res.error) : "加载失败");
        return;
      }
      setRows(res.rows);
    });
  }, [customer.id]);

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>客户流水</DialogTitle>
          <DialogDescription>
            {customer.name} · #{customer.memberNo}
            {customer.wechat ? ` · ${customer.wechat}` : ""} · 当前余额{" "}
            {formatYuan(customer.balanceCents)}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto rounded-lg border">
          {error ? (
            <div className="p-8 text-center text-sm text-destructive">{error}</div>
          ) : pending && !rows ? (
            <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
              <Loader2 className="animate-spin" />
              加载中
            </div>
          ) : rows && rows.length > 0 ? (
            <ul className="divide-y">
              {rows.map((r) => (
                <li
                  key={r.id}
                  className="flex items-start justify-between gap-4 px-4 py-3"
                >
                  {r.kind === "ORDER" ? (
                    <OrderLedgerRow row={r} />
                  ) : (
                    <BalanceLedgerRow row={r} />
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-8 text-center text-sm text-muted-foreground">
              暂无客户流水
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function OrderLedgerRow({ row }: { row: CustomerOrderLedgerRow }) {
  const remainingCents = row.payableCents - row.prepayUsedCents;
  return (
    <>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
          <span>订单 · {row.playerName} 接单</span>
          <Badge variant={row.orderStatus === "COMPLETED" ? "success" : "outline"}>
            {orderStatusLabel[row.orderStatus]}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {new Date(row.startAt).toLocaleString("zh-CN", { hour12: false })}
          </span>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          {formatDuration(row.durationMin)} · 派单 {row.dispatcherName} · 订单金额{" "}
          <span className="font-mono">{formatYuan(row.payableCents)}</span>
          {row.prepayUsedCents > 0
            ? ` · 预存抵扣 ${formatYuan(row.prepayUsedCents)} · 还需支付 ${formatYuan(
                remainingCents
              )}`
            : ""}
          {row.note ? ` · ${row.note}` : ""}
        </div>
      </div>
      <div className="font-mono text-sm font-semibold tabular-nums">
        {formatYuan(row.payableCents)}
      </div>
    </>
  );
}

function BalanceLedgerRow({ row }: { row: CustomerBalanceLedgerRow }) {
  return (
    <>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
          <span>{txnLabel[row.type]}</span>
          <span className="text-xs text-muted-foreground">
            {new Date(row.createdAt).toLocaleString("zh-CN", { hour12: false })}
          </span>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          操作人 {row.actorName}
          {row.playerNames && row.playerNames.length > 0
            ? ` · 陪玩 ${row.playerNames.join("、")}`
            : ""}
          {row.orderId && row.orderStartAt
            ? ` · 订单 ${new Date(row.orderStartAt).toLocaleString("zh-CN", {
                hour12: false,
              })}`
            : ""}
          {row.note ? ` · ${row.note}` : ""}
        </div>
      </div>
      <div
        className={
          row.amountCents >= 0
            ? "font-mono text-sm font-semibold text-success"
            : "font-mono text-sm font-semibold text-foreground"
        }
      >
        {row.amountCents >= 0 ? "+" : ""}
        {formatYuan(row.amountCents)}
      </div>
    </>
  );
}
