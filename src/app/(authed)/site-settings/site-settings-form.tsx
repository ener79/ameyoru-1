"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, Loader2, Trash2, Upload } from "lucide-react";
import { updateSiteSettingsAction } from "@/server/actions/site-settings";
import { THEME_PRESETS } from "@/lib/theme-presets";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

const schema = z.object({
  siteName: z.string().min(1, "站点名称不能为空").max(100),
  contactInfo: z.string().max(500),
  footerText: z.string().max(500),
  themePreset: z.string(),
  customThemeCSS: z.string(),
  borderRadius: z.string(),
  unsettledWarnDays: z.coerce.number().int().min(1, "至少 1 天").max(90, "最多 90 天"),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  settings: {
    siteName: string;
    logoPath: string | null;
    contactInfo: string | null;
    footerText: string | null;
    themePreset: string;
    customThemeCSS: string | null;
    borderRadius: string | null;
    unsettledWarnDays: number;
  };
}

export function SiteSettingsForm({ settings }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      siteName: settings.siteName,
      contactInfo: settings.contactInfo ?? "",
      footerText: settings.footerText ?? "",
      themePreset: settings.themePreset,
      customThemeCSS: settings.customThemeCSS ?? "",
      borderRadius: settings.borderRadius ?? "0.75rem",
      unsettledWarnDays: settings.unsettledWarnDays,
    },
  });

  const [showCustom, setShowCustom] = useState(!!settings.customThemeCSS);
  const [logoPreview, setLogoPreview] = useState<string | null>(
    settings.logoPath ? `/api/uploads/${settings.logoPath}` : null
  );
  const fileRef = useRef<HTMLInputElement>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);

  const themePreset = form.watch("themePreset");
  const customCSS = form.watch("customThemeCSS");
  const borderRadius = form.watch("borderRadius");

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    if (logoPreview?.startsWith("blob:")) URL.revokeObjectURL(logoPreview);
    setLogoPreview(URL.createObjectURL(file));
  }

  useEffect(() => {
    return () => {
      if (logoPreview?.startsWith("blob:")) URL.revokeObjectURL(logoPreview);
    };
  }, [logoPreview]);

  function onSubmit(values: FormValues) {
    const fd = new FormData();
    fd.set("siteName", values.siteName);
    fd.set("contactInfo", values.contactInfo);
    fd.set("footerText", values.footerText);
    fd.set("themePreset", values.themePreset);
    fd.set("customThemeCSS", showCustom ? values.customThemeCSS : "");
    fd.set("borderRadius", values.borderRadius);
    fd.set("unsettledWarnDays", String(values.unsettledWarnDays));
    if (logoFile) fd.set("logo", logoFile);

    startTransition(async () => {
      const res = await updateSiteSettingsAction(fd);
      if (!res.ok) {
        toast.error(res.error ?? "保存失败");
        return;
      }
      toast.success("设置已保存");
      router.refresh();
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Card className="p-6 space-y-4">
          <div>
            <h2 className="text-base font-semibold">基本信息</h2>
            <p className="mt-1 text-xs text-muted-foreground">站点名称和 Logo</p>
          </div>
          <div className="space-y-2">
            <Label>Logo</Label>
            <div className="flex items-center gap-4">
              {logoPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoPreview} alt="Logo 预览" className="size-16 rounded-xl object-cover border" />
              ) : (
                <div className="size-16 rounded-xl border border-dashed flex items-center justify-center text-muted-foreground">
                  <Upload className="size-5" />
                </div>
              )}
              <div>
                <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                  选择图片
                </Button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
                <p className="mt-1 text-xs text-muted-foreground">最大 5MB，推荐正方形</p>
              </div>
            </div>
          </div>
          <FormField
            control={form.control}
            name="siteName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>站点名称</FormLabel>
                <FormControl>
                  <Input maxLength={100} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="unsettledWarnDays"
            render={({ field }) => (
              <FormItem>
                <FormLabel>未结算预警天数</FormLabel>
                <FormControl>
                  <Input type="number" min={1} max={90} {...field} />
                </FormControl>
                <FormDescription>
                  订单超过该天数未结算时，总览页会显示预警提示
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </Card>

        <Card className="p-6 space-y-4">
          <div>
            <h2 className="text-base font-semibold">主题</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              选择预设主题，或粘贴自定义 CSS
              {showCustom && customCSS && (
                <Badge variant="secondary" className="ml-2">当前使用自定义主题</Badge>
              )}
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {THEME_PRESETS.map((preset) => (
              <button
                key={preset.key}
                type="button"
                onClick={() => {
                  form.setValue("themePreset", preset.key);
                  setShowCustom(false);
                  form.setValue("customThemeCSS", "");
                }}
                className={cn(
                  "flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all",
                  themePreset === preset.key && !showCustom
                    ? "border-foreground ring-2 ring-foreground/20"
                    : "border-border hover:border-foreground/30"
                )}
              >
                <div className="flex flex-col gap-1">
                  <div className="flex gap-1">
                    <div className="size-5 rounded-full" style={{ background: preset.preview.primary }} />
                    <div className="size-5 rounded-full" style={{ background: preset.preview.secondary }} />
                    <div className="size-5 rounded-full" style={{ background: preset.preview.accent }} />
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{preset.label}</div>
                  <div className="text-xs text-muted-foreground truncate">{preset.description}</div>
                </div>
              </button>
            ))}
          </div>

          <div className="border-t pt-4 space-y-2">
            <Label>圆角大小</Label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="0"
                max="1"
                step="0.0625"
                value={borderRadius ? parseFloat(borderRadius) : 0.75}
                onChange={(e) => form.setValue("borderRadius", `${e.target.value}rem`)}
                className="flex-1 accent-primary"
              />
              <span className="text-sm font-mono w-16 text-right tabular-nums">
                {borderRadius || "0.75rem"}
              </span>
            </div>
            <div className="flex gap-2">
              <div className="border size-8" style={{ borderRadius: borderRadius || "0.75rem" }} />
              <div className="border size-8 bg-primary/10" style={{ borderRadius: borderRadius || "0.75rem" }} />
              <span className="text-xs text-muted-foreground self-center">预览</span>
            </div>
          </div>

          <div className="border-t pt-4">
            <button
              type="button"
              onClick={() => setShowCustom(!showCustom)}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {showCustom ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
              高级：自定义主题 CSS
            </button>
            {showCustom && (
              <div className="mt-3 space-y-2">
                <textarea
                  className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm font-mono min-h-[160px] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 outline-none"
                  value={customCSS}
                  onChange={(e) => form.setValue("customThemeCSS", e.target.value)}
                  placeholder={`:root {\n  --primary: oklch(0.55 0.2 295);\n  --primary-foreground: oklch(0.985 0 0);\n  /* ... */\n}\n.dark {\n  --primary: oklch(0.65 0.19 292);\n  /* ... */\n}`}
                />
                <p className="text-xs text-muted-foreground">
                  粘贴从 <a href="https://tweakcn.com" target="_blank" rel="noopener" className="underline">tweakcn.com</a> 或 <a href="https://ui.shadcn.com/create" target="_blank" rel="noopener" className="underline">shadcn/create</a> 导出的 CSS 变量。格式：<code className="text-[11px]">{`:root { --变量: 值; } .dark { ... }`}</code>
                </p>
                {customCSS && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => { form.setValue("customThemeCSS", ""); setShowCustom(false); }}
                  >
                    <Trash2 className="size-3.5" /> 清除自定义，使用预设
                  </Button>
                )}
              </div>
            )}
          </div>
        </Card>

        <Card className="p-6 space-y-4">
          <div>
            <h2 className="text-base font-semibold">其他信息</h2>
            <p className="mt-1 text-xs text-muted-foreground">联系方式和底部文字</p>
          </div>
          <FormField
            control={form.control}
            name="contactInfo"
            render={({ field }) => (
              <FormItem>
                <FormLabel>联系方式</FormLabel>
                <FormControl>
                  <Input maxLength={500} placeholder="如：客服微信 xxx" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="footerText"
            render={({ field }) => (
              <FormItem>
                <FormLabel>底部文字</FormLabel>
                <FormControl>
                  <Input maxLength={500} placeholder="如：© 2025 xxx 版权所有" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </Card>

        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          {pending ? "保存中" : "保存设置"}
        </Button>
      </form>
    </Form>
  );
}
