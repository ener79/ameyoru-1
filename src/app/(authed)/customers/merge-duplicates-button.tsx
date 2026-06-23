"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { GitMerge, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { mergeAllDuplicatesAction } from "@/server/actions/customers";

export function MergeDuplicatesButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleClick() {
    if (!confirm("确认一键合并所有同名客户？\n\n同名客户的订单、流水、余额都会归到最早创建的那个，不可撤销。")) {
      return;
    }
    startTransition(async () => {
      try {
        const res = await mergeAllDuplicatesAction();
        if (res.mergedCount === 0) {
          toast.info("没有发现同名客户");
        } else {
          toast.success(`已合并 ${res.mergedCount} 个重复客户`);
        }
        router.refresh();
      } catch {
        toast.error("合并失败，请重试");
      }
    });
  }

  return (
    <Button variant="outline" onClick={handleClick} disabled={pending}>
      {pending ? <Loader2 className="animate-spin" /> : <GitMerge />}
      一键合并同名
    </Button>
  );
}
