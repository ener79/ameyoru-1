"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  FileText,
  Loader2,
  MinusCircle,
  RotateCcw,
  Search,
  WalletCards,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { formatYuan } from "@/lib/format";
import { addCustomerDepositAction } from "@/server/actions/customers";
import {
  prepayDeductAction,
  reverseTxnAction,
  getPrepayLedgerAction,
} from "@/server/actions/prepay";
import type { CustomerBalanceTxnType } from "@/db/schema";

interface PrepayCustomer {
  id: string;
  name: string;
  memberNo: string;
  balanceCents: number;
}

interface LedgerRow {
  id: string;
  type: CustomerBalanceTxnType;
  amountCents: number;
  reversedTxnId: string | null;
  isReversed: boolean;
  note: string | null;
  createdAt: string;
  actorName: string;
}

const txnLabel: Record<CustomerBalanceTxnType, string> = {
  DEPOSIT: "充值",
  ORDER_DEBIT: "订单抵扣",
  ORDER_REFUND: "取消退回",
  MANUAL_DEDUCT: "预存扣减(老板提取)",
  SERVICE_DEDUCT: "扣款",
  REVERSAL: "回撤",
};

const REVERSIBLE: string[] = ["DEPOSIT", "MANUAL_DEDUCT", "SERVICE_DEDUCT"];

export function PrepayClient({
  canManage,
  customers,
}: {
  canManage: boolean;
  customers: PrepayCustomer[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [searchPending, startSearch] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const [depositing, setDepositing] = useState<PrepayCustomer | null>(null);
  const [deducting, setDeducting] = useState<PrepayCustomer | null>(null);
  const [ledgerCustomer, setLedgerCustomer] = useState<PrepayCustomer | null>(
    null
  );

  function handleSearch(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      startSearch(() => {
        const sp = new URLSearchParams();
        if (value) sp.set("q", value);
        router.push(`/prepay?${sp.toString()}`);
      });
    }, 400);
  }

  return (
    <>
      <div className="mb-4">
        <div className="relative w-full sm:w-64">
          {searchPending ? (
            <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 size-4 animate-spin text-muted-foreground" />
          ) : (
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          )}
          <Input
            value={query}
            placeholder="搜索客户名/会员号…"
            className="pl-9 pr-8"
            onChange={(e) => handleSearch(e.target.value)}
          />
          {query && !searchPending && (
            <button
              onClick={() => handleSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {customers.length === 0 ? (
        <EmptyState
          icon={<WalletCards />}
          title="暂无预存客户"
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <ul className="divide-y">
            {customers.map((c) => (
              <li
                key={c.id}
                className="flex flex-col gap-3 px-4 py-3 hover:bg-accent/40 sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <span className="truncate">{c.name}</span>
                    <span className="font-mono text-xs text-muted-foreground opacity-60">
                      #{c.memberNo}
                    </span>
                  </div>
                  <div className="font-mono text-sm font-semibold tabular-nums text-success">
                    余额 {formatYuan(c.balanceCents)}
                  </div>
                </div>
                <div className="flex items-center gap-1 sm:gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDeducting(c)}
                    className="flex-1 sm:flex-none"
                  >
                    <MinusCircle /> 扣款
                  </Button>
                  {canManage && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setDepositing(c)}
                      className="flex-1 sm:flex-none"
                    >
                      <WalletCards /> 充值
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setLedgerCustomer(c)}
                    className="flex-1 sm:flex-none"
                  >
                    <FileText /> 流水
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
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
          onClose={() => setDeducting(null)}
        />
      )}

      {ledgerCustomer && (
        <LedgerDialog
          key={ledgerCustomer.id}
          customer={ledgerCustomer}
          canManage={canManage}
          onClose={() => setLedgerCustomer(null)}
        />
      )}
    </>
  );
}

function DepositDialog({
  customer,
  onClose,
}: {
  customer: PrepayCustomer;
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
            {customer.name} · 当前余额{" "}
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

function DeductDialog({
  customer,
  onClose,
}: {
  customer: PrepayCustomer;
  onClose: () => void;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await prepayDeductAction({
        customerId: customer.id,
        amountYuan: amount,
        note: note.trim() || null,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("已扣款");
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>扣款</DialogTitle>
          <DialogDescription>
            {customer.name} · 当前余额{" "}
            <span className="font-mono">
              {formatYuan(customer.balanceCents)}
            </span>
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="deduct-amount">扣款金额(元)</Label>
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
            <Label htmlFor="deduct-note">备注(选填)</Label>
            <Input
              id="deduct-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="收钱备注"
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
              确认扣款
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LedgerDialog({
  customer,
  canManage,
  onClose,
}: {
  customer: PrepayCustomer;
  canManage: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<LedgerRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [reversingId, setReversingId] = useState<string | null>(null);

  function load() {
    startTransition(async () => {
      const res = await getPrepayLedgerAction({
        customerId: customer.id,
      });
      if (!res.ok) {
        setError("加载失败");
        return;
      }
      setRows(res.rows);
    });
  }

  useEffect(() => {
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer.id]);

  function handleReverse(txn: LedgerRow) {
    setReversingId(txn.id);
  }

  return (
    <>
      <Dialog open onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>预存流水</DialogTitle>
            <DialogDescription>
              {customer.name} · #{customer.memberNo} · 当前余额{" "}
              {formatYuan(customer.balanceCents)}
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[60vh] overflow-y-auto rounded-lg border">
            {error ? (
              <div className="p-8 text-center text-sm text-destructive">
                {error}
              </div>
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
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        <span className={r.isReversed ? "line-through opacity-50" : ""}>
                          {txnLabel[r.type]}
                        </span>
                        {r.isReversed && (
                          <Badge variant="outline" className="text-[10px]">
                            已回撤
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {new Date(r.createdAt).toLocaleString("zh-CN", {
                            hour12: false,
                          })}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        操作人 {r.actorName}
                        {r.note ? ` · ${r.note}` : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={
                          r.isReversed
                            ? "font-mono text-sm font-semibold line-through opacity-50"
                            : r.amountCents >= 0
                              ? "font-mono text-sm font-semibold text-success"
                              : "font-mono text-sm font-semibold text-foreground"
                        }
                      >
                        {r.amountCents >= 0 ? "+" : ""}
                        {formatYuan(r.amountCents)}
                      </span>
                      {canManage &&
                        !r.isReversed &&
                        REVERSIBLE.includes(r.type) && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            onClick={() => handleReverse(r)}
                            title="回撤"
                          >
                            <RotateCcw className="size-3.5" />
                          </Button>
                        )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="p-8 text-center text-sm text-muted-foreground">
                暂无流水记录
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {reversingId && rows && (
        <ReverseConfirmDialog
          txn={rows.find((r) => r.id === reversingId)!}
          customerName={customer.name}
          onClose={(ok) => {
            setReversingId(null);
            if (ok) {
              load();
              router.refresh();
            }
          }}
        />
      )}
    </>
  );
}

function ReverseConfirmDialog({
  txn,
  customerName,
  onClose,
}: {
  txn: LedgerRow;
  customerName: string;
  onClose: (succeeded: boolean) => void;
}) {
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      const res = await reverseTxnAction({
        txnId: txn.id,
        note: note.trim() || null,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("已回撤");
      onClose(true);
    });
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>回撤交易</DialogTitle>
          <DialogDescription>
            确认回撤 {customerName} 的「{txnLabel[txn.type]}」
            {txn.amountCents >= 0 ? "+" : ""}
            {formatYuan(txn.amountCents)}？
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reverse-note">备注(选填)</Label>
            <Input
              id="reverse-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="回撤原因"
              maxLength={200}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => onClose(false)}
              disabled={pending}
            >
              取消
            </Button>
            <Button onClick={handleConfirm} disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              确认回撤
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
