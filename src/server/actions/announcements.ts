"use server";

import { revalidatePath } from "next/cache";
import { eq, desc, and, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { announcement } from "@/db/schema";
import { requireSession } from "@/lib/auth-helpers";
import { nanoid } from "../id";
import { logAudit } from "@/server/audit";

const upsertSchema = z.object({
  id: z.string().optional(),
  type: z.enum(["NOTICE", "ACTIVITY"]),
  title: z.string().min(1).max(100),
  content: z.string().max(5000).optional().nullable(),
  contentJson: z.string().max(100000).optional().nullable(),
  contentHtml: z.string().max(100000).optional().nullable(),
  isPermanent: z.boolean().optional(),
  startAt: z.string().optional().nullable(),
  endAt: z.string().optional().nullable(),
  sortOrder: z.number().int().optional(),
});

export type UpsertAnnouncementInput = z.input<typeof upsertSchema>;

import DOMPurify from "isomorphic-dompurify";

function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "p", "br", "strong", "em", "u", "s",
      "h1", "h2", "h3",
      "ul", "ol", "li",
      "blockquote", "pre", "code",
      "a", "img",
    ],
    ALLOWED_ATTR: ["href", "src", "alt", "target", "rel", "class"],
  });
}

function invalidate() {
  revalidatePath("/overview");
  revalidatePath("/announcements");
}

export async function upsertAnnouncementAction(input: UpsertAnnouncementInput) {
  const { user: me } = await requireSession({ role: ["BOSS", "STAFF"] });
  const parsed = upsertSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.errors[0]?.message ?? "参数错误" };
  const d = parsed.data;

  const shared = {
    type: d.type,
    title: d.title,
    content: d.content ?? null,
    contentJson: d.contentJson ?? null,
    contentHtml: d.contentHtml ? sanitizeHtml(d.contentHtml) : null,
    isPermanent: d.isPermanent ?? false,
    startAt: d.startAt ? new Date(d.startAt) : null,
    endAt: d.endAt ? new Date(d.endAt) : null,
    sortOrder: d.sortOrder ?? 0,
  };

  if (d.id) {
    await db.update(announcement).set(shared).where(eq(announcement.id, d.id));
  } else {
    await db.insert(announcement).values({
      id: nanoid(),
      ...shared,
      enabled: true,
      createdById: me.id,
    });
  }
  logAudit({ actorId: me.id, actorName: me.name, action: d.id ? "UPDATE_ANNOUNCEMENT" : "CREATE_ANNOUNCEMENT", targetType: "announcement", targetId: d.id, detail: { title: d.title, type: d.type } });
  invalidate();
  return { ok: true as const };
}

export async function toggleAnnouncementAction(input: { id: string; enabled: boolean }) {
  const { user: me } = await requireSession({ role: ["BOSS", "STAFF"] });
  await db.update(announcement).set({ enabled: input.enabled }).where(eq(announcement.id, input.id));
  logAudit({ actorId: me.id, actorName: me.name, action: input.enabled ? "ENABLE_ANNOUNCEMENT" : "DISABLE_ANNOUNCEMENT", targetType: "announcement", targetId: input.id });
  invalidate();
  return { ok: true as const };
}

export async function deleteAnnouncementAction(input: { id: string }) {
  const { user: me } = await requireSession({ role: ["BOSS", "STAFF"] });
  await db.delete(announcement).where(eq(announcement.id, input.id));
  logAudit({ actorId: me.id, actorName: me.name, action: "DELETE_ANNOUNCEMENT", targetType: "announcement", targetId: input.id });
  invalidate();
  return { ok: true as const };
}

export async function getAnnouncements() {
  return db.select().from(announcement).orderBy(desc(announcement.sortOrder), desc(announcement.createdAt));
}

export async function getActiveAnnouncements() {
  const now = new Date();
  const all = await db.select().from(announcement).where(eq(announcement.enabled, true)).orderBy(desc(announcement.sortOrder), desc(announcement.createdAt));
  return all.filter((a) => {
    if (a.isPermanent) return true;
    if (a.startAt && a.startAt > now) return false;
    if (a.endAt && a.endAt < now) return false;
    return true;
  });
}

/** 登录页用：显示所有启用的公告，不过滤时间 */
export async function getAllEnabledAnnouncements() {
  return db.select().from(announcement).where(eq(announcement.enabled, true)).orderBy(desc(announcement.sortOrder), desc(announcement.createdAt));
}
