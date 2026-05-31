"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Check,
  Copy,
  KeyRound,
  Loader2,
  MoreHorizontal,
  Pencil,
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
import { avatarInitial, centsToYuanString, formatYuan } from "@/lib/format";
import {
  ALL_PRICE_BUCKETS_CENTS,
  PRICE_BUCKETS_CENTS,
} from "@/lib/constants";
import {
  createPlayerAction,
  resetPlayerQrSecurityCodeAction,
  resetUserPasswordAction,
  toggleUserActiveAction,
  updatePlayerProfileAction,
} from "@/server/actions/users";
import type { PlayerGender } from "@/db/schema";

interface Player {
  id: string;
  username: string;
  displayName: string;
  active: boolean;
  playerGender: PlayerGender | null;
  defaultRateCents: number | null;
  mustChangePwd: boolean;
  wechatQrPath: string | null;
  alipayQrPath: string | null;
  hasQrSecurityCode: boolean;
  createdAt: string;
}

interface Credential {
  title: string;
  description: string;
  username: string;
  password: string;
}

const genderLabel: Record<PlayerGender, string> = {
  MALE: "男陪",
  FEMALE: "女陪",
};

export function PlayersClient({
  canManage,
  players,
}: {
  canManage: boolean;
  players: Player[];
}) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [showInactive, setShowInactive] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [securityCodePlayer, setSecurityCodePlayer] = useState<Player | null>(
    null
  );
  const [credentialDialog, setCredentialDialog] = useState<Credential | null>(
    null
  );
  const [pending, startTransition] = useTransition();

  const filteredPlayers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return players.filter((p) => {
      if (!showInactive && !p.active) return false;
      if (!q) return true;
      return (
        p.displayName.toLowerCase().includes(q) ||
        p.username.toLowerCase().includes(q)
      );
    });
  }, [players, searchQuery, showInactive]);

  const groupedPlayers = useMemo(
    () => ({
      MALE: filteredPlayers.filter((p) => p.playerGender === "MALE"),
      FEMALE: filteredPlayers.filter((p) => p.playerGender === "FEMALE"),
      UNSET: filteredPlayers.filter((p) => !p.playerGender),
    }),
    [filteredPlayers]
  );

  function handleToggle(p: Player) {
    startTransition(async () => {
      const res = await toggleUserActiveAction({ id: p.id, active: !p.active });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(
        p.active ? `已停用 ${p.displayName}` : `已激活 ${p.displayName}`
      );
      router.refresh();
    });
  }

  function handleReset(p: Player) {
    if (!confirm(`重置 ${p.displayName} 的密码?旧密码会立即失效`)) return;
    startTransition(async () => {
      const res = await resetUserPasswordAction({ id: p.id });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setCredentialDialog({
        title: `${p.displayName} 的新密码`,
        description: "把这个密码交给陪玩,登录后会强制改密。",
        username: p.username,
        password: res.newPassword,
      });
      router.refresh();
    });
  }

  return (
    <>
      <div className="mb-4 space-y-3">
        <div className="flex gap-2">
          <Input
            placeholder="搜索名字或用户名…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="max-w-xs"
          />
          <Button
            variant={showInactive ? "outline" : "default"}
            size="sm"
            onClick={() => setShowInactive(!showInactive)}
          >
            {showInactive ? "显示全部" : "仅显示活跃"}
          </Button>
        </div>
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {filteredPlayers.length === players.length
              ? `共 ${players.length} 位陪玩，${players.filter((p) => p.active).length} 位活跃`
              : `显示 ${filteredPlayers.length} / ${players.length} 位`}
          </div>
          {canManage && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus /> 新建陪玩
            </Button>
          )}
        </div>
      </div>

      {filteredPlayers.length === 0 ? (
        <EmptyState
          icon={<Plus />}
          title={searchQuery ? "没有匹配的陪玩" : "还没有陪玩"}
          description={!searchQuery && canManage ? "点击「新建陪玩」开始" : undefined}
          action={
            !searchQuery && canManage ? (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus /> 新建陪玩
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="space-y-6">
          <PlayerPriceSection
            title="男陪"
            players={groupedPlayers.MALE}
            buckets={PRICE_BUCKETS_CENTS.MALE}
            canManage={canManage}
            pending={pending}
            onEdit={setEditingPlayer}
            onResetSecurityCode={setSecurityCodePlayer}
            onReset={handleReset}
            onToggle={handleToggle}
          />
          <PlayerPriceSection
            title="女陪"
            players={groupedPlayers.FEMALE}
            buckets={PRICE_BUCKETS_CENTS.FEMALE}
            canManage={canManage}
            pending={pending}
            onEdit={setEditingPlayer}
            onResetSecurityCode={setSecurityCodePlayer}
            onReset={handleReset}
            onToggle={handleToggle}
          />
          {groupedPlayers.UNSET.length > 0 && (
            <PlayerPriceSection
              title="未分类"
              players={groupedPlayers.UNSET}
              buckets={ALL_PRICE_BUCKETS_CENTS}
              canManage={canManage}
              pending={pending}
              onEdit={setEditingPlayer}
              onResetSecurityCode={setSecurityCodePlayer}
              onReset={handleReset}
              onToggle={handleToggle}
            />
          )}
        </div>
      )}

      {canManage && (
        <>
          <CreatePlayerDialog
            open={createOpen}
            onOpenChange={setCreateOpen}
            onCreated={(c) => setCredentialDialog(c)}
          />
          <EditPlayerDialog
            player={editingPlayer}
            onClose={() => setEditingPlayer(null)}
          />
          <ResetQrSecurityCodeDialog
            player={securityCodePlayer}
            onClose={() => setSecurityCodePlayer(null)}
          />
        </>
      )}

      <CredentialDialog
        info={credentialDialog}
        onClose={() => setCredentialDialog(null)}
      />
    </>
  );
}

function PlayerPriceSection({
  title,
  players,
  buckets,
  canManage,
  pending,
  onEdit,
  onResetSecurityCode,
  onReset,
  onToggle,
}: {
  title: string;
  players: Player[];
  buckets: number[];
  canManage: boolean;
  pending: boolean;
  onEdit: (player: Player) => void;
  onResetSecurityCode: (player: Player) => void;
  onReset: (player: Player) => void;
  onToggle: (player: Player) => void;
}) {
  const bucketSet = new Set(buckets);
  const otherPlayers = players.filter(
    (p) => p.defaultRateCents == null || !bucketSet.has(p.defaultRateCents)
  );

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold">{title}</h2>
        <Badge variant="secondary">{players.length} 人</Badge>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {buckets.map((priceBucket) => (
          <PriceBucket
            key={priceBucket}
            priceBucket={priceBucket}
            players={players.filter((p) => p.defaultRateCents === priceBucket)}
            canManage={canManage}
            pending={pending}
            onEdit={onEdit}
            onResetSecurityCode={onResetSecurityCode}
            onReset={onReset}
            onToggle={onToggle}
          />
        ))}
        {otherPlayers.length > 0 && (
          <PriceBucket
            label="其他"
            players={otherPlayers}
            canManage={canManage}
            pending={pending}
            onEdit={onEdit}
            onResetSecurityCode={onResetSecurityCode}
            onReset={onReset}
            onToggle={onToggle}
          />
        )}
      </div>
    </section>
  );
}

function PriceBucket({
  priceBucket,
  label,
  players,
  canManage,
  pending,
  onEdit,
  onResetSecurityCode,
  onReset,
  onToggle,
}: {
  priceBucket?: number;
  label?: string;
  players: Player[];
  canManage: boolean;
  pending: boolean;
  onEdit: (player: Player) => void;
  onResetSecurityCode: (player: Player) => void;
  onReset: (player: Player) => void;
  onToggle: (player: Player) => void;
}) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-3">
        <div>
          <div className="font-mono text-sm font-semibold tabular-nums">
            {priceBucket != null ? `${formatYuan(priceBucket)}/h` : label}
          </div>
          <div className="text-xs text-muted-foreground">
            {players.length} 人
          </div>
        </div>
      </div>
      {players.length === 0 ? (
        <div className="px-4 py-5 text-sm text-muted-foreground">暂无</div>
      ) : (
        <ul className="divide-y">
          {players.map((p) => (
            <PlayerRow
              key={p.id}
              player={p}
              canManage={canManage}
              pending={pending}
              onEdit={onEdit}
              onResetSecurityCode={onResetSecurityCode}
              onReset={onReset}
              onToggle={onToggle}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}

function PlayerRow({
  player,
  canManage,
  pending,
  onEdit,
  onResetSecurityCode,
  onReset,
  onToggle,
}: {
  player: Player;
  canManage: boolean;
  pending: boolean;
  onEdit: (player: Player) => void;
  onResetSecurityCode: (player: Player) => void;
  onReset: (player: Player) => void;
  onToggle: (player: Player) => void;
}) {
  const hasQr = !!(player.wechatQrPath || player.alipayQrPath);

  return (
    <li className="flex items-center gap-3 px-4 py-3 hover:bg-accent/40">
      <Avatar className="size-9">
        <AvatarFallback className="bg-primary/10 text-primary text-xs">
          {avatarInitial(player.displayName)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-medium">{player.displayName}</span>
          {player.playerGender && (
            <Badge variant="outline" className="text-[10px]">
              {genderLabel[player.playerGender]}
            </Badge>
          )}
          {!player.active && (
            <Badge variant="outline" className="text-[10px]">
              已停用
            </Badge>
          )}
          {player.active && player.mustChangePwd && (
            <Badge variant="warning" className="text-[10px]">
              待改密
            </Badge>
          )}
          {!hasQr && (
            <Badge variant="warning" className="text-[10px]">
              缺收款码
            </Badge>
          )}
          {!player.hasQrSecurityCode && (
            <Badge variant="warning" className="text-[10px]">
              缺安全码
            </Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          @{player.username}
          {player.defaultRateCents != null &&
            ` · ${formatYuan(player.defaultRateCents)}/h`}
        </div>
      </div>
      {canManage && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="操作">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={() => onEdit(player)} disabled={pending}>
              <Pencil /> 编辑分类/单价
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onReset(player)}
              disabled={pending}
            >
              <RotateCw /> 重置密码
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onResetSecurityCode(player)}
              disabled={pending}
            >
              <KeyRound /> 重置收款码安全码
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {player.active ? (
              <DropdownMenuItem
                variant="destructive"
                onClick={() => onToggle(player)}
              >
                <PowerOff /> 停用账号
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => onToggle(player)}>
                <Power /> 激活账号
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </li>
  );
}

function CreatePlayerDialog({
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
  const [playerGender, setPlayerGender] = useState<PlayerGender>("FEMALE");
  const [defaultRate, setDefaultRate] = useState("40");
  const [pending, startTransition] = useTransition();

  function reset() {
    setUsername("");
    setDisplayName("");
    setPlayerGender("FEMALE");
    setDefaultRate("40");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await createPlayerAction({
        username,
        displayName,
        playerGender,
        defaultRateYuan: defaultRate,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      onOpenChange(false);
      reset();
      router.refresh();
      onCreated({
        title: `${res.displayName} 创建成功`,
        description: "把这个初始密码交给陪玩。只显示一次,关闭后无法再查看。",
        username: res.username,
        password: res.initialPassword,
      });
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新建陪玩</DialogTitle>
          <DialogDescription>
            创建后会生成一次性初始密码,陪玩首次登录会强制改密
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="username">用户名(登录用)</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder=""
                required
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="displayName">显示名</Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder=""
                required
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="playerGender">分类</Label>
              <select
                id="playerGender"
                value={playerGender}
                onChange={(e) => setPlayerGender(e.target.value as PlayerGender)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                <option value="FEMALE">女陪</option>
                <option value="MALE">男陪</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="defaultRate">默认单价(元/小时)</Label>
              <select
                id="defaultRate"
                value={defaultRate}
                onChange={(e) => setDefaultRate(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                {PRICE_BUCKETS_CENTS[playerGender].map((c) => {
                  const v = String(c / 100);
                  return <option key={v} value={v}>{v}</option>;
                })}
              </select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            分类和单价会用于老板后台按男陪/女陪、价格档查看。
          </p>
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

function EditPlayerDialog({
  player,
  onClose,
}: {
  player: Player | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [playerGender, setPlayerGender] = useState<PlayerGender>("FEMALE");
  const [defaultRate, setDefaultRate] = useState("40");

  useEffect(() => {
    if (!player) return;
    setPlayerGender(player.playerGender ?? "FEMALE");
    setDefaultRate(centsToYuanString(player.defaultRateCents) || "40");
  }, [player]);

  function handleOpenChange(open: boolean) {
    if (!open) onClose();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!player) return;
    startTransition(async () => {
      const res = await updatePlayerProfileAction({
        id: player.id,
        playerGender,
        defaultRateYuan: defaultRate,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("已更新陪玩分类");
      onClose();
      router.refresh();
    });
  }

  if (!player) return null;

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>编辑 {player.displayName}</DialogTitle>
          <DialogDescription>
            调整后会影响陪玩后台的分类展示和派单默认单价
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="editPlayerGender">分类</Label>
              <select
                id="editPlayerGender"
                value={playerGender}
                onChange={(e) => setPlayerGender(e.target.value as PlayerGender)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                <option value="FEMALE">女陪</option>
                <option value="MALE">男陪</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="editDefaultRate">默认单价(元/小时)</Label>
              <Input
                id="editDefaultRate"
                type="number"
                step="0.01"
                min="0"
                value={defaultRate}
                onChange={(e) => setDefaultRate(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              取消
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />} 保存
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResetQrSecurityCodeDialog({
  player,
  onClose,
}: {
  player: Player | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [securityCode, setSecurityCode] = useState("");
  const [confirm, setConfirm] = useState("");

  function handleOpenChange(open: boolean) {
    if (!open) {
      setSecurityCode("");
      setConfirm("");
      onClose();
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!player) return;
    if (securityCode.length < 6) {
      toast.error("收款码安全码至少 6 位");
      return;
    }
    if (securityCode !== confirm) {
      toast.error("两次安全码不一致");
      return;
    }
    startTransition(async () => {
      const res = await resetPlayerQrSecurityCodeAction({
        id: player.id,
        securityCode,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("已重置收款码安全码");
      setSecurityCode("");
      setConfirm("");
      onClose();
      router.refresh();
    });
  }

  if (!player) return null;

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>重置 {player.displayName} 的收款码安全码</DialogTitle>
          <DialogDescription>
            重置后,陪玩更换或删除收款码时需要输入新的安全码
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="qrSecurityCode">新安全码</Label>
              <Input
                id="qrSecurityCode"
                type="password"
                value={securityCode}
                onChange={(e) => setSecurityCode(e.target.value)}
                minLength={6}
                maxLength={32}
                required
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmQrSecurityCode">确认安全码</Label>
              <Input
                id="confirmQrSecurityCode"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                minLength={6}
                maxLength={32}
                required
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            安全码不要和登录密码一样,支持文字、数字和常用符号
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              取消
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />} 保存
            </Button>
          </DialogFooter>
        </form>
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
