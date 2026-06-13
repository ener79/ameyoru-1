"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Check,
  Copy,
  Link2,
  Loader2,
  MoreHorizontal,
  Plus,
  Power,
  PowerOff,
  RotateCw,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";
import { avatarInitial, formatYuan } from "@/lib/format";
import { PRICE_BUCKETS_CENTS } from "@/lib/constants";
import {
  createPlayerInviteAction,
  deletePlayerInviteAction,
} from "@/server/actions/player-invites";
import {
  createStaffAction,
  deleteStaffAction,
  resetUserPasswordAction,
  toggleUserActiveAction,
} from "@/server/actions/users";
import type { PlayerGender } from "@/db/schema";

interface Staff {
  id: string;
  username: string;
  displayName: string;
  active: boolean;
  mustChangePwd: boolean;
  createdAt: string;
}

interface Invite {
  id: string;
  inviteToken: string;
  playerGender: "MALE" | "FEMALE" | null;
  defaultRateCents: number | null;
  maxUses: number;
  useCount: number;
  expiresAt: string;
  createdAt: string;
  createdByName: string;
}

interface Credential {
  title: string;
  description: string;
  username: string;
  password: string;
}

export function StaffClient({
  isBoss,
  staff,
  invites,
}: {
  isBoss: boolean;
  staff: Staff[];
  invites: Invite[];
}) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteLink, setInviteLink] = useState("");
  const [credentialDialog, setCredentialDialog] = useState<Credential | null>(
    null
  );
  const [hideInactive, setHideInactive] = useState(false);
  const [pending, startTransition] = useTransition();
  const [confirmResetStaff, setConfirmResetStaff] = useState<Staff | null>(null);
  const [confirmDeleteStaff, setConfirmDeleteStaff] = useState<Staff | null>(null);

  const hasInactive = staff.some((s) => !s.active);
  const visibleStaff = hideInactive ? staff.filter((s) => s.active) : staff;

  function handleToggle(s: Staff) {
    startTransition(async () => {
      const res = await toggleUserActiveAction({ id: s.id, active: !s.active });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(s.active ? `已停用 ${s.displayName}` : `已激活 ${s.displayName}`);
      router.refresh();
    });
  }

  const handleReset = useCallback((s: Staff) => {
    setConfirmResetStaff(null);
    startTransition(async () => {
      const res = await resetUserPasswordAction({ id: s.id });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setCredentialDialog({
        title: `${s.displayName} 的新密码`,
        description: "把这个密码交给员工,登录后会强制改密。",
        username: s.username,
        password: res.newPassword,
      });
      router.refresh();
    });
  }, [router, startTransition]);

  const handleDelete = useCallback((s: Staff) => {
    setConfirmDeleteStaff(null);
    startTransition(async () => {
      const res = await deleteStaffAction({ id: s.id });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`已删除 ${s.displayName}`);
      router.refresh();
    });
  }, [router, startTransition]);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span>
            共 {staff.length} 位店长/合伙人,
            {staff.filter((s) => s.active).length} 位活跃
          </span>
          {hasInactive && (
            <label className="flex cursor-pointer items-center gap-1.5 select-none">
              <Checkbox
                checked={hideInactive}
                onCheckedChange={(v) => setHideInactive(!!v)}
              />
              <span>隐藏已停用</span>
            </label>
          )}
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setInviteOpen(true)}>
            <Link2 /> 创建陪玩链接
          </Button>
          {isBoss && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus /> 新建店长
            </Button>
          )}
        </div>
      </div>

      <InviteList invites={invites} />

      {staff.length === 0 ? (
        <EmptyState
          icon={<Plus />}
          title="还没有店长"
          description={isBoss ? "点击「新建店长」开始" : "请联系店主创建店长账号"}
          action={
            isBoss ? (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus /> 新建店长
              </Button>
            ) : undefined
          }
        />
      ) : visibleStaff.length === 0 ? (
        <Card className="px-4 py-6 text-center text-sm text-muted-foreground">
          已隐藏所有停用账号
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <ul className="divide-y">
            {visibleStaff.map((s) => (
              <li
                key={s.id}
                className="flex items-center gap-3 px-4 py-3 hover:bg-accent/40"
              >
                <Avatar className="size-9">
                  <AvatarFallback className="bg-primary/10 text-primary text-xs">
                    {avatarInitial(s.displayName)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{s.displayName}</span>
                    {!s.active && (
                      <Badge variant="outline" className="text-[10px]">
                        已停用
                      </Badge>
                    )}
                    {s.active && s.mustChangePwd && (
                      <Badge variant="warning" className="text-[10px]">
                        待改密
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    @{s.username}
                  </div>
                </div>
                {isBoss && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label="操作">
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem
                        onClick={() => setConfirmResetStaff(s)}
                        disabled={pending}
                      >
                        <RotateCw /> 重置密码
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {s.active ? (
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => handleToggle(s)}
                        >
                          <PowerOff /> 停用账号
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem onClick={() => handleToggle(s)}>
                          <Power /> 激活账号
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => setConfirmDeleteStaff(s)}
                        disabled={pending}
                      >
                        <Trash2 /> 删除账号
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <CreateStaffDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(c) => setCredentialDialog(c)}
      />
      <CreateInviteDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onCreated={setInviteLink}
      />

      <CredentialDialog
        info={credentialDialog}
        onClose={() => setCredentialDialog(null)}
      />
      <InviteLinkDialog link={inviteLink} onClose={() => setInviteLink("")} />

      <ConfirmDialog
        open={!!confirmResetStaff}
        onOpenChange={(open) => { if (!open) setConfirmResetStaff(null); }}
        onConfirm={() => confirmResetStaff && handleReset(confirmResetStaff)}
        title="重置密码"
        description={`重置 ${confirmResetStaff?.displayName} 的密码?旧密码会立即失效`}
        confirmLabel="重置"
      />

      <ConfirmDialog
        open={!!confirmDeleteStaff}
        onOpenChange={(open) => { if (!open) setConfirmDeleteStaff(null); }}
        onConfirm={() => confirmDeleteStaff && handleDelete(confirmDeleteStaff)}
        title="删除账号"
        description={`删除 ${confirmDeleteStaff?.displayName}?此操作不可撤销,有业务记录的店长会自动拦截`}
        confirmLabel="删除"
      />
    </>
  );
}

function InviteList({ invites }: { invites: Invite[] }) {
  const router = useRouter();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (invites.length === 0) return null;

  // Group by gender + rate, pick the newest active link per group
  const now = Date.now();
  const groups = new Map<string, { gender: string; rateCents: number; genderLabel: string; rateLabel: string; active: Invite | null; total: number; activeCount: number }>();

  for (const inv of invites) {
    const key = `${inv.playerGender ?? "ANY"}-${inv.defaultRateCents ?? 0}`;
    if (!groups.has(key)) {
      const gl = inv.playerGender === "MALE" ? "男陪" : inv.playerGender === "FEMALE" ? "女陪" : "不限";
      const rl = inv.defaultRateCents ? formatYuan(inv.defaultRateCents) + "/h" : "未设单价";
      groups.set(key, { gender: inv.playerGender ?? "ANY", rateCents: inv.defaultRateCents ?? 0, genderLabel: gl, rateLabel: rl, active: null, total: 0, activeCount: 0 });
    }
    const g = groups.get(key)!;
    g.total++;
    const expired = new Date(inv.expiresAt).getTime() < now;
    const exhausted = inv.maxUses > 0 && inv.useCount >= inv.maxUses;
    if (!expired && !exhausted) {
      g.activeCount++;
      if (!g.active || new Date(inv.createdAt) > new Date(g.active.createdAt)) {
        g.active = inv;
      }
    }
  }

  const sorted = [...groups.values()].sort((a, b) => {
    if (a.gender !== b.gender) return a.gender === "MALE" ? -1 : 1;
    return a.rateCents - b.rateCents;
  });

  async function copyLink(inv: Invite) {
    const link = `${window.location.origin}/player-invite/${inv.inviteToken}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopiedId(inv.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      toast.error("复制失败");
    }
  }

  return (
    <Card className="mb-4 overflow-hidden p-0">
      <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2.5">
        <span className="text-xs font-medium text-muted-foreground">
          陪玩邀请链接
        </span>
        <span className="text-xs text-muted-foreground">
          每个档位一条链接，复制发给陪玩即可注册
        </span>
      </div>
      <div className="divide-y">
        {sorted.map((g) => (
          <div key={`${g.gender}-${g.rateCents}`} className="flex items-center gap-3 px-4 py-3">
            <Badge variant={g.gender === "MALE" ? "secondary" : "default"} className="w-12 justify-center">
              {g.genderLabel}
            </Badge>
            <span className="font-mono text-sm font-semibold w-16">{g.rateLabel}</span>
            <div className="flex-1 text-xs text-muted-foreground">
              {g.activeCount > 0 ? `${g.activeCount} 条可用` : "无可用链接"}
              {g.total > g.activeCount && ` · ${g.total - g.activeCount} 条已失效`}
            </div>
            {g.active ? (
              <Button
                size="sm"
                variant={copiedId === g.active.id ? "default" : "outline"}
                onClick={() => copyLink(g.active!)}
                className="gap-1"
              >
                {copiedId === g.active.id ? <><Check className="size-3" /> 已复制</> : <><Copy className="size-3" /> 复制链接</>}
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">需新建</span>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}


function CreateInviteDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (link: string) => void;
}) {
  const router = useRouter();
  const [playerGender, setPlayerGender] = useState("FEMALE");
  const [defaultRate, setDefaultRate] = useState("40");
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await createPlayerInviteAction({
        playerGender: playerGender as "MALE" | "FEMALE",
        maxUses: 0,
        defaultRateYuan: defaultRate,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const origin = window.location.origin;
      onOpenChange(false);
      onCreated(`${origin}/player-invite/${res.token}`);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>创建陪玩链接</DialogTitle>
          <DialogDescription>
            发给陪玩后,陪玩可自己设置名字、用户名、密码和收款码
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="invite-gender">默认分类</Label>
              <select
                id="invite-gender"
                value={playerGender}
                onChange={(e) => setPlayerGender(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                <option value="FEMALE">女陪</option>
                <option value="MALE">男陪</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-rate">默认单价(元/小时)</Label>
              <select
                id="invite-rate"
                value={defaultRate}
                onChange={(e) => setDefaultRate(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                {PRICE_BUCKETS_CENTS[playerGender as PlayerGender].map((c) => {
                  const v = String(c / 100);
                  return <option key={v} value={v}>{v}</option>;
                })}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              创建链接
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CreateStaffDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (info: Credential) => void;
}) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [pending, startTransition] = useTransition();

  function reset() {
    setUsername("");
    setDisplayName("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await createStaffAction({ username, displayName });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      onOpenChange(false);
      reset();
      router.refresh();
      onCreated({
        title: `${res.displayName} 创建成功`,
        description: "把这个初始密码交给员工,登录后会强制改密。",
        username: res.username,
        password: res.initialPassword,
      });
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新建店长</DialogTitle>
          <DialogDescription>
            店长/合伙人和店主同权限,可管理店长、陪玩、订单和客户
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="staff-username">用户名(登录用)</Label>
              <Input
                id="staff-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="lily"
                required
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="staff-name">显示名</Label>
              <Input
                id="staff-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="小莉"
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />} 创建
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function InviteLinkDialog({
  link,
  onClose,
}: {
  link: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  if (!link) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("复制失败,请手动选中复制");
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>陪玩链接已创建</DialogTitle>
          <DialogDescription>
            复制后发给陪玩,填写完成后账号直接可用
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-xl border bg-muted/40 p-4 font-mono text-sm break-all">
          {link}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={copy}>
            {copied ? <Check /> : <Copy />}
            {copied ? "已复制" : "复制链接"}
          </Button>
          <Button onClick={onClose}>知道了</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CredentialDialog({
  info,
  onClose,
}: {
  info: Credential | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  if (!info) return null;
  const text = `用户名: ${info.username}\n密码: ${info.password}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("复制失败,请手动选中复制");
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{info.title}</DialogTitle>
          <DialogDescription>{info.description}</DialogDescription>
        </DialogHeader>
        <div className="rounded-xl border bg-muted/40 p-5 space-y-3 font-mono text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-xs">用户名</span>
            <span className="font-semibold">{info.username}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-xs">密码</span>
            <span className="font-semibold text-base">{info.password}</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={copy}>
            {copied ? <Check /> : <Copy />}
            {copied ? "已复制" : "复制"}
          </Button>
          <Button onClick={onClose}>知道了</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
