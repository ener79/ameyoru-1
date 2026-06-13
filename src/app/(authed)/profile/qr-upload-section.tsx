"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, QrCode, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  deleteQrCodeAction,
  uploadQrCodeAction,
} from "@/server/actions/qr";

type QrType = "WECHAT" | "ALIPAY";

interface QrUploadSectionProps {
  wechatPath: string | null;
  alipayPath: string | null;
  hasSecurityCode: boolean;
}

export function QrUploadSection({
  wechatPath,
  alipayPath,
  hasSecurityCode,
}: QrUploadSectionProps) {
  return (
    <div className="space-y-4">
      {!hasSecurityCode && (
        <div className="rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-xs text-warning-foreground">
          当前账号还没有收款码安全码,请联系店长重新生成开户链接或重置安全码
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <QrSlot
          type="WECHAT"
          label="微信收款码"
          path={wechatPath}
          disabled={!hasSecurityCode}
        />
        <QrSlot
          type="ALIPAY"
          label="支付宝收款码"
          path={alipayPath}
          disabled={!hasSecurityCode}
        />
      </div>
    </div>
  );
}

function QrSlot({
  type,
  label,
  path,
  disabled,
}: {
  type: QrType;
  label: string;
  path: string | null;
  disabled: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [securityCode, setSecurityCode] = useState("");
  // 上传后用一个时间戳强制刷新 <img src>(同 URL 浏览器会缓存)
  const [imgVersion, setImgVersion] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.set("type", type);
    fd.set("file", file);
    fd.set("securityCode", securityCode);
    startTransition(async () => {
      const res = await uploadQrCodeAction(fd);
      if (!res.ok) {
        toast.error(res.error ?? "上传失败");
        return;
      }
      toast.success("已更新");
      setSecurityCode("");
      setImgVersion((v) => v + 1);
      router.refresh();
    });
    // 重置 input,允许重新选同一个文件
    e.target.value = "";
  }

  function handleDelete() {
    setConfirmDelete(false);
    startTransition(async () => {
      const res = await deleteQrCodeAction({ type, securityCode });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("已删除");
      setSecurityCode("");
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        {path ? (
          <span className="text-xs text-success">已上传</span>
        ) : (
          <span className="text-xs text-muted-foreground">未上传</span>
        )}
      </div>

      <Input
        type="password"
        value={securityCode}
        onChange={(e) => setSecurityCode(e.target.value)}
        placeholder="收款码安全码"
        disabled={pending || disabled}
      />

      {path ? (
        // 显示当前码
        <div className="relative aspect-square overflow-hidden rounded-lg border bg-muted/30">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/uploads/${path}?v=${imgVersion}`}
            alt={label}
            className="size-full object-contain"
          />
        </div>
      ) : (
        // 未上传占位
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={pending || disabled || !securityCode.trim()}
          className="flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/30 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:opacity-50"
        >
          <QrCode className="size-8" />
          <span className="text-xs">点击上传</span>
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/bmp,image/avif,image/heic,image/heif"
        className="hidden"
        onChange={handleFileSelect}
      />

      {path && (
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => inputRef.current?.click()}
            disabled={pending || disabled || !securityCode.trim()}
          >
            {pending ? <Loader2 className="animate-spin" /> : <Upload />}
            更换
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => setConfirmDelete(true)}
            disabled={pending || disabled || !securityCode.trim()}
          >
            <Trash2 />
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        onConfirm={handleDelete}
        title="删除收款码"
        description="确认删除该收款码？"
        confirmLabel="删除"
      />
    </div>
  );
}
