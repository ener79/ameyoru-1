"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { KeyRound, Loader2 } from "lucide-react";
import { changeOwnQrSecurityCodeAction } from "@/server/actions/me";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function QrSecurityCodeForm({
  hasSecurityCode,
}: {
  hasSecurityCode: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [currentSecurityCode, setCurrentSecurityCode] = useState("");
  const [newSecurityCode, setNewSecurityCode] = useState("");
  const [confirmSecurityCode, setConfirmSecurityCode] = useState("");

  function reset() {
    setCurrentSecurityCode("");
    setNewSecurityCode("");
    setConfirmSecurityCode("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (newSecurityCode !== confirmSecurityCode) {
      toast.error("两次安全码不一致");
      return;
    }

    startTransition(async () => {
      const res = await changeOwnQrSecurityCodeAction({
        currentSecurityCode,
        newSecurityCode,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("收款码安全码已修改");
      reset();
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        {hasSecurityCode && (
          <div className="space-y-2">
            <Label htmlFor="currentQrSecurityCode">当前安全码</Label>
            <Input
              id="currentQrSecurityCode"
              type="password"
              value={currentSecurityCode}
              onChange={(e) => setCurrentSecurityCode(e.target.value)}
              minLength={6}
              maxLength={32}
              required
              autoComplete="current-password"
            />
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="newQrSecurityCode">新安全码</Label>
          <Input
            id="newQrSecurityCode"
            type="password"
            value={newSecurityCode}
            onChange={(e) => setNewSecurityCode(e.target.value)}
            minLength={6}
            maxLength={32}
            required
            autoComplete="new-password"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirmNewQrSecurityCode">确认安全码</Label>
          <Input
            id="confirmNewQrSecurityCode"
            type="password"
            value={confirmSecurityCode}
            onChange={(e) => setConfirmSecurityCode(e.target.value)}
            minLength={6}
            maxLength={32}
            required
            autoComplete="new-password"
          />
        </div>
      </div>
      <Button
        type="submit"
        variant="outline"
        className="w-full sm:w-auto"
        disabled={pending}
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : <KeyRound />}
        {pending ? "保存中" : "修改收款码安全码"}
      </Button>
    </form>
  );
}
