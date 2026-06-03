"use server";

import { revalidatePath } from "next/cache";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { siteSettings } from "@/db/schema";
import { requireSession } from "@/lib/auth-helpers";
import { readImageUpload } from "@/lib/image-upload";
import { THEME_COLOR_OPTIONS, type ThemeColorKey } from "@/lib/theme-colors";
import { nanoid } from "../id";
import { logAudit } from "../audit";

const UPLOAD_ROOT = join(process.cwd(), "uploads");
const MAX_LOGO_BYTES = 5 * 1024 * 1024;
const LOGO_EXTS = ["png", "jpg", "webp", "gif", "avif"];
const THEME_KEYS = THEME_COLOR_OPTIONS.map((o) => o.key) as [string, ...string[]];

const DEFAULT_SETTINGS = {
  siteName: "起点乱斗",
  logoPath: null as string | null,
  contactInfo: null as string | null,
  footerText: null as string | null,
  themeColor: "indigo" as ThemeColorKey,
};

export async function getSiteSettings() {
  const [row] = await db
    .select({
      siteName: siteSettings.siteName,
      logoPath: siteSettings.logoPath,
      contactInfo: siteSettings.contactInfo,
      footerText: siteSettings.footerText,
      themeColor: siteSettings.themeColor,
    })
    .from(siteSettings)
    .limit(1);
  if (!row) return DEFAULT_SETTINGS;
  return {
    ...row,
    themeColor: (row.themeColor ?? "indigo") as ThemeColorKey,
  };
}

const updateSchema = z.object({
  siteName: z.string().min(1, "请填写站点名称").max(100),
  contactInfo: z.string().max(500).optional().nullable().transform((s) => s?.trim() || null),
  footerText: z.string().max(500).optional().nullable().transform((s) => s?.trim() || null),
  themeColor: z.enum(THEME_KEYS),
});

export async function updateSiteSettingsAction(formData: FormData) {
  const { user: me } = await requireSession({ role: ["BOSS", "STAFF"] });

  const raw = {
    siteName: String(formData.get("siteName") ?? ""),
    contactInfo: formData.get("contactInfo") || null,
    footerText: formData.get("footerText") || null,
    themeColor: String(formData.get("themeColor") ?? "indigo"),
  };
  const parsed = updateSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.errors[0]?.message ?? "参数错误" };
  }

  let logoPath: string | null | undefined;
  const logoFile = formData.get("logo");
  if (logoFile instanceof File && logoFile.size > 0) {
    const result = await readImageUpload(logoFile, { maxBytes: MAX_LOGO_BYTES, label: "Logo" });
    if (!result.ok) return { ok: false as const, error: result.error };

    const filename = `logo.${result.upload.ext}`;
    const dir = join(UPLOAD_ROOT, "site");
    await mkdir(dir, { recursive: true });
    for (const ext of LOGO_EXTS) {
      if (ext !== result.upload.ext) {
        await unlink(join(dir, `logo.${ext}`)).catch(() => {});
      }
    }
    await writeFile(join(dir, filename), result.upload.bytes);
    logoPath = `site/${filename}`;
  }

  const [existing] = await db.select({ id: siteSettings.id }).from(siteSettings).limit(1);

  const setData = {
    siteName: parsed.data.siteName,
    contactInfo: parsed.data.contactInfo,
    footerText: parsed.data.footerText,
    themeColor: parsed.data.themeColor,
    updatedAt: new Date(),
    ...(logoPath !== undefined ? { logoPath } : {}),
  };

  if (existing) {
    await db.update(siteSettings).set(setData).where(eq(siteSettings.id, existing.id));
  } else {
    await db.insert(siteSettings).values({ id: nanoid(), ...setData });
  }

  logAudit({
    actorId: me.id,
    actorName: me.name,
    action: "UPDATE_SITE_SETTINGS",
    targetType: "site_settings",
  });

  revalidatePath("/", "layout");
  return { ok: true as const };
}
