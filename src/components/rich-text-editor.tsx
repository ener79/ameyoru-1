"use client";

import { useCallback } from "react";
import { useEditor, EditorContent, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import ImageExt from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  List,
  ListOrdered,
  Underline as UnderlineIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface RichTextValue {
  json: JSONContent;
  html: string;
  text: string;
}

interface Props {
  content: JSONContent | null;
  onChange: (value: RichTextValue) => void;
  placeholder?: string;
}

export function RichTextEditor({ content, onChange, placeholder }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      ImageExt.configure({ inline: false, allowBase64: false }),
      Placeholder.configure({
        placeholder: placeholder ?? "输入公告内容…",
      }),
    ],
    content: content ?? undefined,
    immediatelyRender: false,
    onUpdate: ({ editor: e }) => {
      onChange({ json: e.getJSON(), html: e.getHTML(), text: e.getText() });
    },
    editorProps: {
      attributes: {
        class: "max-w-none min-h-[120px] px-3 py-2 focus:outline-none",
      },
    },
  });

  const handleImageUpload = useCallback(async () => {
    if (!editor) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const fd = new FormData();
      fd.set("file", file);
      try {
        const res = await fetch("/api/uploads/announcement-image", {
          method: "POST",
          body: fd,
        });
        const data = await res.json();
        if (!res.ok || !data.url) {
          toast.error(data.error ?? "上传失败");
          return;
        }
        editor.chain().focus().setImage({ src: data.url }).run();
      } catch {
        toast.error("上传失败");
      }
    };
    input.click();
  }, [editor]);

  if (!editor) return null;

  return (
    <div className="rounded-md border border-input overflow-hidden">
      <div className="flex flex-wrap items-center gap-0.5 border-b bg-muted/30 px-1.5 py-1">
        <ToolBtn
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="加粗"
        >
          <Bold />
        </ToolBtn>
        <ToolBtn
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="斜体"
        >
          <Italic />
        </ToolBtn>
        <ToolBtn
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          title="下划线"
        >
          <UnderlineIcon />
        </ToolBtn>
        <div className="mx-1 h-5 w-px bg-border" />
        <ToolBtn
          active={editor.isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          title="标题 2"
        >
          <Heading2 />
        </ToolBtn>
        <ToolBtn
          active={editor.isActive("heading", { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          title="标题 3"
        >
          <Heading3 />
        </ToolBtn>
        <div className="mx-1 h-5 w-px bg-border" />
        <ToolBtn
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          title="无序列表"
        >
          <List />
        </ToolBtn>
        <ToolBtn
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          title="有序列表"
        >
          <ListOrdered />
        </ToolBtn>
        <div className="mx-1 h-5 w-px bg-border" />
        <ToolBtn active={false} onClick={handleImageUpload} title="插入图片">
          <ImagePlus />
        </ToolBtn>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

function ToolBtn({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn("size-7 [&_svg]:size-3.5", active && "bg-accent")}
      onClick={onClick}
      title={title}
    >
      {children}
    </Button>
  );
}
