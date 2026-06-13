"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Plus, Megaphone, Trash2, ToggleLeft, ToggleRight, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { formatDate } from "@/lib/format";
import { RichTextEditor } from "@/components/rich-text-editor";
import { upsertAnnouncementAction, toggleAnnouncementAction, deleteAnnouncementAction } from "@/server/actions/announcements";
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

const formSchema = z.object({
  id: z.string().optional(),
  type: z.enum(["NOTICE", "ACTIVITY"]),
  title: z.string().min(1, "请填写标题").max(100),
  content: z.string().max(5000).nullable(),
  contentJson: z.string().max(100000).nullable(),
  contentHtml: z.string().max(100000).nullable(),
  isPermanent: z.boolean(),
  startAt: z.string().nullable(),
  endAt: z.string().nullable(),
  sortOrder: z.coerce.number().int(),
});

type FormValues = z.infer<typeof formSchema>;

const emptyForm: FormValues = {
  type: "NOTICE", title: "", content: "", contentJson: null, contentHtml: null,
  isPermanent: false, startAt: null, endAt: null, sortOrder: 0,
};

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
  const [editorJson, setEditorJson] = useState<JSONContent | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: emptyForm,
  });

  const isPermanent = form.watch("isPermanent");

  function openNew() {
    setEditItem(null);
    setEditorJson(null);
    form.reset(emptyForm);
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
    form.reset({
      id: item.id,
      type: item.type,
      title: item.title,
      content: item.content ?? "",
      contentJson: item.contentJson,
      contentHtml: item.contentHtml,
      isPermanent: item.isPermanent,
      startAt: item.startAt?.slice(0, 16) ?? null,
      endAt: item.endAt?.slice(0, 16) ?? null,
      sortOrder: item.sortOrder,
    });
    setShowForm(true);
  }

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const res = await upsertAnnouncementAction(values);
      if (res.ok) {
        toast.success(editItem ? "已更新" : "已创建");
        setShowForm(false);
        router.refresh();
      } else {
        toast.error(res.error);
      }
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
          <Form {...form}>
            <div className="space-y-4">
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>类型</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="NOTICE">公告</SelectItem>
                        <SelectItem value="ACTIVITY">活动</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>标题</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div>
                <FormLabel>内容</FormLabel>
                <div className="mt-2">
                  <RichTextEditor
                    key={editItem?.id ?? "new"}
                    content={editorJson}
                    onChange={({ json, html, text }) => {
                      form.setValue("contentJson", JSON.stringify(json));
                      form.setValue("contentHtml", html);
                      form.setValue("content", text);
                    }}
                  />
                </div>
              </div>
              <FormField
                control={form.control}
                name="isPermanent"
                render={({ field }) => (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="perm"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                    <FormLabel htmlFor="perm" className="!mt-0">长期有效</FormLabel>
                  </div>
                )}
              />
              {!isPermanent && (
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="startAt"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>开始时间</FormLabel>
                        <FormControl>
                          <Input
                            type="datetime-local"
                            value={field.value ?? ""}
                            onChange={(e) => field.onChange(e.target.value || null)}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="endAt"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>结束时间</FormLabel>
                        <FormControl>
                          <Input
                            type="datetime-local"
                            value={field.value ?? ""}
                            onChange={(e) => field.onChange(e.target.value || null)}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
              )}
              <FormField
                control={form.control}
                name="sortOrder"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>排序（越大越前）</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
          </Form>
          <DialogFooter>
            <Button onClick={form.handleSubmit(onSubmit)} disabled={pending}>
              {editItem ? "保存" : "创建"}
            </Button>
          </DialogFooter>
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
