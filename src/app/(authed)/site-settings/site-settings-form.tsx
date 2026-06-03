"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";
import { updateSiteSettingsAction } from "@/server/actions/site-settings";
import { THEME_COLOR_OPTIONS, THEME_COLORS, type ThemeColorKey } from "@/lib/theme-colors";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  settings: {
    siteName: string;
    logoPath: string | null;
    contactInfo: string | null;
    footerText: string | null;
    themeColor: ThemeColorKey;
  };
}

export function SiteSettingsForm({ settings }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [siteName, setSiteName] = useState(settings.siteName);
  const [contactInfo, setContactInfo] = useState(settings.contactInfo ?? "");
  const [footerText, setFooterText] = useState(settings.footerText ?? "");
  const [themeColor, setThemeColor] = useState<ThemeColorKey>(settings.themeColor);
  const [logoPreview, setLogoPreview] = useState<string | null>(
    settings.logoPath ? `/api/uploads/${settings.logoPath}` : null
  );
  const fileRef = useRef<HTMLInputElement>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const fd = new FormData();
    fd.set("siteName", siteName);
    fd.set("contactInfo", contactInfo);
    fd.set("footerText", footerText);
    fd.set("themeColor", themeColor);
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
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card className="p-6 space-y-4">
        <div>
          <h2 className="text-base font-semibold">基本信息</h2>
          <p className="mt-1 text-xs text-muted-foreground">站点名称和 Logo</p>
        </div>

        <div className="space-y-2">
          <Label>Logo</Label>
          <div className="flex items-center gap-4">
            {logoPreview ? (
              <img
                src={logoPreview}
                alt="Logo 预览"
                className="size-16 rounded-xl object-cover border"
              />
            ) : (
              <div className="size-16 rounded-xl border border-dashed flex items-center justify-center text-muted-foreground">
                <Upload className="size-5" />
              </div>
            )}
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
              >
                选择图片
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleLogoChange}
              />
              <p className="mt-1 text-xs text-muted-foreground">最大 5MB，推荐正方形</p>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="siteName">站点名称</Label>
          <Input
            id="siteName"
            value={siteName}
            onChange={(e) => setSiteName(e.target.value)}
            maxLength={100}
            required
          />
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <div>
          <h2 className="text-base font-semibold">主题色</h2>
          <p className="mt-1 text-xs text-muted-foreground">选择全站主色调</p>
        </div>
        <div className="flex flex-wrap gap-3">
          {THEME_COLOR_OPTIONS.map((opt) => {
            const color = THEME_COLORS[opt.key];
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => setThemeColor(opt.key)}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-lg border px-3 py-2 transition-all",
                  themeColor === opt.key
                    ? "border-foreground ring-2 ring-foreground/20"
                    : "border-border hover:border-foreground/30"
                )}
              >
                <div
                  className="size-8 rounded-full"
                  style={{ background: color.light }}
                />
                <span className="text-xs">{opt.label}</span>
              </button>
            );
          })}
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <div>
          <h2 className="text-base font-semibold">其他信息</h2>
          <p className="mt-1 text-xs text-muted-foreground">联系方式和底部文字</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="contactInfo">联系方式</Label>
          <Input
            id="contactInfo"
            value={contactInfo}
            onChange={(e) => setContactInfo(e.target.value)}
            maxLength={500}
            placeholder="如：客服微信 xxx"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="footerText">底部文字</Label>
          <Input
            id="footerText"
            value={footerText}
            onChange={(e) => setFooterText(e.target.value)}
            maxLength={500}
            placeholder="如：© 2025 xxx 版权所有"
          />
        </div>
      </Card>

      <Button type="submit" disabled={pending}>
        {pending && <Loader2 className="size-4 animate-spin" />}
        {pending ? "保存中" : "保存设置"}
      </Button>
    </form>
  );
}
