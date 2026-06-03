import { cache } from "react";
import { db } from "@/db";
import { siteSettings } from "@/db/schema";

export const DEFAULT_SITE_SETTINGS = {
  siteName: "起点乱斗",
  logoPath: null as string | null,
  contactInfo: null as string | null,
  footerText: null as string | null,
  themePreset: "default",
  customThemeCSS: null as string | null,
  borderRadius: null as string | null,
};

/**
 * 站点设置全站只有一行。用 React cache 包一层,
 * 同一次请求内(根布局 metadata + 根布局渲染 + authed 布局)多处读取只查一次库。
 */
export const getSiteSettings = cache(async () => {
  const [row] = await db
    .select({
      siteName: siteSettings.siteName,
      logoPath: siteSettings.logoPath,
      contactInfo: siteSettings.contactInfo,
      footerText: siteSettings.footerText,
      themePreset: siteSettings.themePreset,
      customThemeCSS: siteSettings.customThemeCSS,
      borderRadius: siteSettings.borderRadius,
    })
    .from(siteSettings)
    .limit(1);
  return row ?? DEFAULT_SITE_SETTINGS;
});
