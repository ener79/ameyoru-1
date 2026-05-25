"use client";

import { useState, useTransition } from "react";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
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
import { EmptyState } from "@/components/empty-state";
import { avatarInitial } from "@/lib/format";
import { createPlayerInviteAction } from "@/server/actions/player-invites";
import {
  createStaffAction,
  resetUserPasswordAction,
  toggleUserActiveAction,
} from "@/server/actions/users";

interface Staff {
  id: string;
  username: string;
  displayName: string;
  active: boolean;
  mustChangePwd: boolean;
  createdAt: string;
}

interface Credential {
  title: string;
  description: string;
  username: string;
  password: string;
}

export function StaffClient({ staff }: { staff: Staff[] }) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteLink, setInviteLink] = useState("");
  const [credentialDialog, setCredentialDialog] = useState<Credential | null>(
    null
  );
  const [pending, startTransition] = useTransition();

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

  function handleReset(s: Staff) {
    if (!confirm(`重置 ${s.displayName} 的密码?旧密码会立即失效`)) return;
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
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          共 {staff.length} 位店长/合伙人,
          {staff.filter((s) => s.active).length} 位活跃
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setInviteOpen(true)}>
            <Link2 /> 创建陪玩链接
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus /> 新建店长
          </Button>
        </div>
      </div>

      {staff.length === 0 ? (
        <EmptyState
          icon={<Plus />}
          title="还没有店长"
          description="点击「新建店长」开始"
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus /> 新建店长
            </Button>
          }
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <ul className="divide-y">
            {staff.map((s) => (
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
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label="操作">
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem
                      onClick={() => handleReset(s)}
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
                  </DropdownMenuContent>
                </DropdownMenu>
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
    </>
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
                {(playerGender === "MALE"
                  ? ["35", "40", "45", "50"]
                  : ["40", "45", "50", "55"]
                ).map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
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
