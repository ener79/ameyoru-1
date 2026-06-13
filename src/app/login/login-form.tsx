"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Lock, User } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { InputWithIcon } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const [pending, startTransition] = useTransition();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const { error } = await authClient.signIn.username({
        username: username.trim(),
        password,
        rememberMe,
      });
      if (error) {
        toast.error(error.message ?? "用户名或密码错误");
        return;
      }
      // 硬跳转,确保浏览器已写入 session cookie 才发下一次请求,
      // 避免 router.push + refresh 触发的 RSC 请求带不上 cookie。
      window.location.assign("/");
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="username">用户名</Label>
        <InputWithIcon
          id="username"
          icon={<User />}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="请输入用户名"
          autoComplete="username"
          autoFocus
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">密码</Label>
        <InputWithIcon
          id="password"
          icon={<Lock />}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="请输入密码"
          autoComplete="current-password"
          required
        />
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground select-none">
        <Checkbox
          checked={rememberMe}
          onCheckedChange={(v) => setRememberMe(!!v)}
        />
        <span>30 天内免登录</span>
      </label>

      <Button type="submit" className="w-full" size="lg" disabled={pending}>
        {pending && <Loader2 className="size-4 animate-spin" />}
        {pending ? "登录中" : "立即登录"}
      </Button>
    </form>
  );
}
