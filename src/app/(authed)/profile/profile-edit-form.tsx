"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Pencil } from "lucide-react";
import { updateOwnProfileAction } from "@/server/actions/me";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ProfileEditForm({
  initialName,
  initialUsername,
}: {
  initialName: string;
  initialUsername: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(initialName);
  const [username, setUsername] = useState(initialUsername);

  const unchanged = name === initialName && username === initialUsername;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("显示名不能为空");
      return;
    }
    if (username.length < 2) {
      toast.error("用户名至少 2 位");
      return;
    }
    startTransition(async () => {
      const res = await updateOwnProfileAction({ name, username });
      if (!res.ok) {
        toast.error(res.error ?? "修改失败");
        return;
      }
      toast.success("资料已更新");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="edit-name">显示名</Label>
        <Input
          id="edit-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={32}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="edit-username">用户名</Label>
        <Input
          id="edit-username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          maxLength={32}
          minLength={2}
          required
        />
        <p className="text-xs text-muted-foreground">
          用于登录,只能包含中文、字母、数字、下划线、点、横线
        </p>
      </div>
      <Button
        type="submit"
        variant="outline"
        className="w-full sm:w-auto"
        disabled={pending || unchanged}
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Pencil />
        )}
        {pending ? "保存中" : "保存修改"}
      </Button>
    </form>
  );
}
