"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertCircle,
  KeyRound,
  Loader2,
  QrCode,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
        <div className="rounded-lg border border-warning/60 bg-warning/10 px-4 py-3 text-warning-foreground shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 size-5 shrink-0" />
              <div>
                <div className="text-sm font-semibold">
                  未设置安全码,暂时不能上传收款码
                </div>
                <p className="mt-1 text-xs leading-relaxed">
                  请先在上方设置好安全码。只要上方设置成功,下面微信和支付宝收款码都可以直接上传,不需要再输入一次安全码。
                </p>
              </div>
            </div>
            <a
              href="#qr-security-code"
              className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-md bg-warning px-3 text-xs font-semibold text-warning-foreground shadow-sm transition-colors hover:bg-warning/90"
            >
              <KeyRound className="size-4" />
              去设置安全码
            </a>
          </div>
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
  // 上传后用一个时间戳强制刷新 <img src>(同 URL 浏览器会缓存)
  const [imgVersion, setImgVersion] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.set("type", type);
    fd.set("file", file);
    startTransition(async () => {
      const res = await uploadQrCodeAction(fd);
      if (!res.ok) {
        toast.error(res.error ?? "上传失败");
        return;
      }
      toast.success("已更新");
      setImgVersion((v) => v + 1);
      router.refresh();
    });
    // 重置 input,允许重新选同一个文件
    e.target.value = "";
  }

  function handleDelete() {
    setConfirmDelete(false);
    startTransition(async () => {
      const res = await deleteQrCodeAction({ type });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("已删除");
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

      {disabled && (
        <div className="rounded-md border border-warning/50 bg-warning/10 px-3 py-2 text-xs font-medium text-warning-foreground">
          请先在上方设置好安全码,设置成功后这里就能上传收款码。
        </div>
      )}

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
          disabled={pending || disabled}
          className="flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/30 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:opacity-50"
        >
          <QrCode className="size-8" />
          <span className="text-xs">
            {disabled ? "请先设置收款码安全码" : "点击上传"}
          </span>
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
            disabled={pending || disabled}
          >
            {pending ? <Loader2 className="animate-spin" /> : <Upload />}
            更换
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => setConfirmDelete(true)}
            disabled={pending || disabled}
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
