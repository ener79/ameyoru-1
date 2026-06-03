"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { changeOwnPasswordAction } from "@/server/actions/me";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ChangePasswordForm({ forced }: { forced: boolean }) {
  const [pending, startTransition] = useTransition();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (next.length < 6) {
      toast.error("新密码至少 6 位");
      return;
    }
    if (next !== confirm) {
      toast.error("两次输入不一致");
      return;
    }
    startTransition(async () => {
      const res = await changeOwnPasswordAction({
        currentPassword: current,
        newPassword: next,
      });
      if (!res.ok) {
        toast.error(res.error ?? "改密失败");
        return;
      }
      toast.success("密码已更新");
      // 硬跳转:revokeOtherSessions 会重发 session cookie,需等浏览器写入后再访问受保护页面。
      window.location.assign("/");
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="current">当前密码</Label>
        <Input
          id="current"
          type="password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          autoComplete="current-password"
          required
          autoFocus
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="next">新密码</Label>
        <Input
          id="next"
          type="password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          autoComplete="new-password"
          minLength={6}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm">确认新密码</Label>
        <Input
          id="confirm"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          minLength={6}
          required
        />
      </div>
      <Button type="submit" className="w-full" disabled={pending} size="lg">
        {pending && <Loader2 className="size-4 animate-spin" />}
        {pending ? "提交中" : forced ? "设置新密码并继续" : "确认修改"}
      </Button>
    </form>
  );
}
