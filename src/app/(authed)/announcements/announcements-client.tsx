"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Megaphone, PartyPopper, Trash2, ToggleLeft, ToggleRight, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { formatDate } from "@/lib/format";
import { RichTextEditor } from "@/components/rich-text-editor";
import { upsertAnnouncementAction, toggleAnnouncementAction, deleteAnnouncementAction } from "@/server/actions/announcements";
import type { UpsertAnnouncementInput } from "@/server/actions/announcements";
import type { JSONContent } from "@tiptap/react";

interface Item {
  id: string;
  type: "NOTICE" | "ACTIVITY";
  title: string;
  content: string | null;
  contentJson: string | null;
  contentHtml: string | null;
  isPermanent: boolean;
  startAt: string | null;
  endAt: string | null;
  sortOrder: number;
  enabled: boolean;
  createdAt: string;
}

/** 旧公告只有纯文本时,用它初始化编辑器,避免编辑保存后内容丢失 */
function textToDoc(text: string): JSONContent {
  return {
    type: "doc",
    content: text.split("\n").map((line) => ({
      type: "paragraph",
      content: line ? [{ type: "text", text: line }] : [],
    })),
  };
}

export function AnnouncementsClient({ items }: { items: Item[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editItem, setEditItem] = useState<Item | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [form, setForm] = useState<UpsertAnnouncementInput>({
    type: "NOTICE", title: "", content: "", contentJson: null, contentHtml: null, isPermanent: false, startAt: null, endAt: null, sortOrder: 0,
  });
  const [editorJson, setEditorJson] = useState<JSONContent | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  function openNew() {
    setEditItem(null);
    setEditorJson(null);
    setForm({ type: "NOTICE", title: "", content: "", contentJson: null, contentHtml: null, isPermanent: false, startAt: null, endAt: null, sortOrder: 0 });
    setShowForm(true);
  }

  function openEdit(item: Item) {
    setEditItem(item);
    const json = item.contentJson
      ? (JSON.parse(item.contentJson) as JSONContent)
      : item.content
      ? textToDoc(item.content)
      : null;
    setEditorJson(json);
    setForm({ id: item.id, type: item.type, title: item.title, content: item.content ?? "", contentJson: item.contentJson, contentHtml: item.contentHtml, isPermanent: item.isPermanent, startAt: item.startAt?.slice(0, 16) ?? null, endAt: item.endAt?.slice(0, 16) ?? null, sortOrder: item.sortOrder });
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
    startTransition(async () => {
      await deleteAnnouncementAction({ id });
      toast.success("已删除");
      router.refresh();
    });
    setConfirmDeleteId(null);
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
                  {item.startAt && <> · 开始: {formatDate(new Date(item.startAt))}</>}
                  {item.endAt && <> · 结束: {formatDate(new Date(item.endAt))}</>}
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button size="icon" variant="ghost" onClick={() => openEdit(item)}><Pencil className="size-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => toggle(item.id, !item.enabled)}>
                  {item.enabled ? <ToggleRight className="size-4" /> : <ToggleLeft className="size-4" />}
                </Button>
                <Button size="icon" variant="ghost" className="text-destructive" onClick={() => setConfirmDeleteId(item.id)}><Trash2 className="size-4" /></Button>
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
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as "NOTICE" | "ACTIVITY" })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NOTICE">公告</SelectItem>
                  <SelectItem value="ACTIVITY">活动</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>标题</Label><Input className="mt-1" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div>
              <Label>内容</Label>
              <div className="mt-1">
                <RichTextEditor
                  key={editItem?.id ?? "new"}
                  content={editorJson}
                  onChange={({ json, html, text }) => {
                    setForm((f) => ({
                      ...f,
                      contentJson: JSON.stringify(json),
                      contentHtml: html,
                      content: text,
                    }));
                  }}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="perm" checked={form.isPermanent ?? false} onCheckedChange={(v) => setForm({ ...form, isPermanent: !!v })} />
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

      <ConfirmDialog
        open={!!confirmDeleteId}
        onOpenChange={(open) => { if (!open) setConfirmDeleteId(null); }}
        onConfirm={() => confirmDeleteId && remove(confirmDeleteId)}
        title="删除公告"
        description="确定删除该公告？此操作无法撤销。"
        confirmLabel="删除"
      />
    </>
  );
}
