"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { centsToYuanString } from "@/lib/format";
import { completePlayerInviteAction } from "@/server/actions/users";
import { authClient } from "@/lib/auth-client";
import type { PlayerGender } from "@/db/schema";

export function PlayerInviteForm({
  token,
  initialGender,
  initialRateCents,
}: {
  token: string;
  initialGender: PlayerGender;
  initialRateCents: number;
}) {
  const [pending, startTransition] = useTransition();
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [securityCode, setSecurityCode] = useState("");
  const [confirmSecurityCode, setConfirmSecurityCode] = useState("");
  const [playerGender, setPlayerGender] = useState<PlayerGender>(initialGender);
  const [defaultRate, setDefaultRate] = useState(
    initialGender === "MALE" ? "35" : "40"
  );
  const [wechatQr, setWechatQr] = useState<File | null>(null);
  const [alipayQr, setAlipayQr] = useState<File | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("两次密码不一致");
      return;
    }
    if (!/(?=.*[a-z])(?=.*[A-Z])/.test(password) || password.length <= 8) {
      toast.error("密码必须超过 8 位,且包含大小写字母");
      return;
    }
    if (securityCode.length < 6) {
      toast.error("收款码安全码至少 6 位");
      return;
    }
    if (securityCode !== confirmSecurityCode) {
      toast.error("两次安全码不一致");
      return;
    }
    if (securityCode === password) {
      toast.error("安全码不能和登录密码一样");
      return;
    }
    if (!wechatQr || !alipayQr) {
      toast.error("请上传微信和支付宝收款码");
      return;
    }

    const fd = new FormData();
    fd.set("token", token);
    fd.set("displayName", displayName.trim());
    fd.set("username", username.trim());
    fd.set("password", password);
    fd.set("qrSecurityCode", securityCode);
    fd.set("playerGender", playerGender);
    fd.set("defaultRateYuan", defaultRate);
    fd.set("wechatQr", wechatQr);
    fd.set("alipayQr", alipayQr);

    startTransition(async () => {
      const res = await completePlayerInviteAction(fd);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      // Auto sign-in。用 window.location.assign 硬跳转,避免 router.push + refresh
      // 在浏览器写入 session cookie 之前就发出 RSC 请求,导致 requireSession 失败。
      const signInRes = await authClient.signIn.username({
        username: username.trim(),
        password,
      });
      if (signInRes.error) {
        toast.success("账号已创建,请登录");
        window.location.assign("/login");
      } else {
        toast.success("账号已创建");
        window.location.assign("/overview");
      }
    });
  }

  return (
    <Card className="p-6">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="displayName">名字</Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder=""
              required
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="username">用户名允许中文</Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder=""
              required
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="password">密码</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={9}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm">确认密码</Label>
            <Input
              id="confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              minLength={9}
              required
            />
          </div>
        </div>
        <p className="-mt-3 text-xs text-muted-foreground">
          密码必须超过 8 位,且包含大小写字母
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="securityCode">收款码安全码</Label>
            <Input
              id="securityCode"
              type="password"
              value={securityCode}
              onChange={(e) => setSecurityCode(e.target.value)}
              minLength={6}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmSecurityCode">确认安全码</Label>
            <Input
              id="confirmSecurityCode"
              type="password"
              value={confirmSecurityCode}
              onChange={(e) => setConfirmSecurityCode(e.target.value)}
              minLength={6}
              required
            />
          </div>
        </div>
        <p className="-mt-3 text-xs text-muted-foreground">
          更换或删除收款码时需要输入,不要和登录密码一样
        </p>

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
              {(playerGender === "MALE"
                ? ["35", "40", "45", "50"]
                : ["40", "45", "50", "55"]
              ).map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <QrInput
            label="微信收款码"
            file={wechatQr}
            onChange={setWechatQr}
          />
          <QrInput
            label="支付宝收款码"
            file={alipayQr}
            onChange={setAlipayQr}
          />
        </div>

        <Button type="submit" className="w-full" size="lg" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Upload />}
          保存
        </Button>
      </form>
    </Card>
  );
}

function QrInput({
  label,
  file,
  onChange,
}: {
  label: string;
  file: File | null;
  onChange: (file: File | null) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/30 px-3 py-4 text-center text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground">
        <Upload className="size-5" />
        <span>{file ? file.name : `上传${label}`}</span>
        <Input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/bmp,image/avif,image/heic,image/heif"
          className="hidden"
          onChange={(e) => onChange(e.target.files?.[0] ?? null)}
          required
        />
      </label>
    </div>
  );
}
