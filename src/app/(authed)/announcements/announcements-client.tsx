"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Megaphone, PartyPopper, Trash2, ToggleLeft, ToggleRight, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { upsertAnnouncementAction, toggleAnnouncementAction, deleteAnnouncementAction } from "@/server/actions/announcements";
import type { UpsertAnnouncementInput } from "@/server/actions/announcements";

interface Item {
  id: string;
  type: "NOTICE" | "ACTIVITY";
  title: string;
  content: string | null;
  isPermanent: boolean;
  startAt: string | null;
  endAt: string | null;
  sortOrder: number;
  enabled: boolean;
  createdAt: string;
}

export function AnnouncementsClient({ items }: { items: Item[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editItem, setEditItem] = useState<Item | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [form, setForm] = useState<UpsertAnnouncementInput>({
    type: "NOTICE", title: "", content: "", isPermanent: false, startAt: null, endAt: null, sortOrder: 0,
  });

  function openNew() {
    setEditItem(null);
    setForm({ type: "NOTICE", title: "", content: "", isPermanent: false, startAt: null, endAt: null, sortOrder: 0 });
    setShowForm(true);
  }

  function openEdit(item: Item) {
    setEditItem(item);
    setForm({ id: item.id, type: item.type, title: item.title, content: item.content ?? "", isPermanent: item.isPermanent, startAt: item.startAt?.slice(0, 16) ?? null, endAt: item.endAt?.slice(0, 16) ?? null, sortOrder: item.sortOrder });
    setShowForm(true);
  }

  function submit() {
    startTransition(async () => {
      const res = await upsertAnnouncementAction(form);
      if (res.ok) { toast.success(editItem ? "已更新" : "已创建"); setShowForm(false); router.refresh(); }
      else toast.error(res.error);
    });
  }

  function toggle(id: string, enabled: boolean) {
    startTransition(async () => {
      await toggleAnnouncementAction({ id, enabled });
      router.refresh();
    });
  }

  function remove(id: string) {
    if (!confirm("确定删除？")) return;
    startTransition(async () => {
      await deleteAnnouncementAction({ id });
      toast.success("已删除");
      router.refresh();
    });
  }

  return (
    <>
      <PageHeader title="公告管理" description="管理首页公告和活动" action={
<Button onClick={openNew}><Plus className="size-4" /> 新增</Button>
} />

      {items.length === 0 ? (
        <EmptyState icon={<Megaphone />} title="暂无公告" />
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <Card key={item.id} className={`p-4 flex items-start justify-between gap-3 ${!item.enabled ? "opacity-50" : ""}`}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Badge variant={item.type === "NOTICE" ? "default" : "secondary"}>
                    {item.type === "NOTICE" ? "公告" : "活动"}
                  </Badge>
                  <span className="font-medium truncate">{item.title}</span>
                  {item.isPermanent && <Badge variant="outline" className="text-[10px]">长期</Badge>}
                  {!item.enabled && <Badge variant="destructive" className="text-[10px]">已禁用</Badge>}
                </div>
                {item.content && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{item.content}</p>}
                <div className="text-xs text-muted-foreground mt-1">
                  排序: {item.sortOrder}
                  {item.startAt && <> · 开始: {new Date(item.startAt).toLocaleDateString()}</>}
                  {item.endAt && <> · 结束: {new Date(item.endAt).toLocaleDateString()}</>}
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button size="icon" variant="ghost" onClick={() => openEdit(item)}><Pencil className="size-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => toggle(item.id, !item.enabled)}>
                  {item.enabled ? <ToggleRight className="size-4" /> : <ToggleLeft className="size-4" />}
                </Button>
                <Button size="icon" variant="ghost" className="text-destructive" onClick={() => remove(item.id)}><Trash2 className="size-4" /></Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editItem ? "编辑" : "新增"}公告/活动</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>类型</Label>
              <select className="w-full border rounded px-3 py-2 text-sm mt-1" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as "NOTICE" | "ACTIVITY" })}>
                <option value="NOTICE">公告</option>
                <option value="ACTIVITY">活动</option>
              </select>
            </div>
            <div><Label>标题</Label><Input className="mt-1" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div><Label>内容</Label><textarea className="w-full border rounded px-3 py-2 text-sm mt-1 min-h-[80px]" value={form.content ?? ""} onChange={(e) => setForm({ ...form, content: e.target.value })} /></div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="perm" checked={form.isPermanent ?? false} onChange={(e) => setForm({ ...form, isPermanent: e.target.checked })} />
              <Label htmlFor="perm">长期有效</Label>
            </div>
            {!form.isPermanent && (
              <div className="grid grid-cols-2 gap-3">
                <div><Label>开始时间</Label><Input type="datetime-local" className="mt-1" value={form.startAt ?? ""} onChange={(e) => setForm({ ...form, startAt: e.target.value || null })} /></div>
                <div><Label>结束时间</Label><Input type="datetime-local" className="mt-1" value={form.endAt ?? ""} onChange={(e) => setForm({ ...form, endAt: e.target.value || null })} /></div>
              </div>
            )}
            <div><Label>排序（越大越前）</Label><Input type="number" className="mt-1" value={form.sortOrder ?? 0} onChange={(e) => setForm({ ...form, sortOrder: parseInt(e.target.value) || 0 })} /></div>
          </div>
          <DialogFooter><Button onClick={submit} disabled={pending}>{editItem ? "保存" : "创建"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
