"use server";

import { revalidatePath } from "next/cache";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema";
import { requireSession } from "@/lib/auth-helpers";
import { readImageUpload } from "@/lib/image-upload";
import { auth } from "@/lib/auth";
import { qrSecurityCodeSchema } from "@/lib/qr-security";

const UPLOAD_ROOT = join(process.cwd(), "uploads");
const MAX_BYTES = 20 * 1024 * 1024; // 20MB
const QR_EXTS = ["png", "jpg", "webp", "gif", "bmp", "avif", "heic", "heif"];

type QrType = "WECHAT" | "ALIPAY";
const fieldFor = (t: QrType) =>
  t === "WECHAT" ? ("wechatQrPath" as const) : ("alipayQrPath" as const);

async function verifyQrSecurityCode(userId: string, securityCode: string) {
  if (!securityCode.trim()) {
    return { ok: false as const, error: "请输入收款码安全码" };
  }

  const parsed = qrSecurityCodeSchema.safeParse(securityCode);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.errors[0]?.message ?? "请输入收款码安全码",
    };
  }

  const [row] = await db
    .select({ qrSecurityCodeHash: user.qrSecurityCodeHash })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (!row?.qrSecurityCodeHash) {
    return { ok: false as const, error: "请联系店长先设置收款码安全码" };
  }

  const ctx = await auth.$context;
  const verified = await ctx.password.verify({
    hash: row.qrSecurityCodeHash,
    password: parsed.data,
  });
  if (!verified) {
    return { ok: false as const, error: "收款码安全码错误" };
  }

  return { ok: true as const };
}

export async function uploadQrCodeAction(formData: FormData) {
  const { user: me } = await requireSession({ role: "PLAYER" });

  const type = formData.get("type") as QrType | null;
  const file = formData.get("file");
  const securityCode = String(formData.get("securityCode") ?? "");

  if (type !== "WECHAT" && type !== "ALIPAY") {
    return { ok: false as const, error: "类型错误" };
  }
  const codeCheck = await verifyQrSecurityCode(me.id, securityCode);
  if (!codeCheck.ok) return codeCheck;
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false as const, error: "请选择文件" };
  }
  const picked = await readImageUpload(file, { maxBytes: MAX_BYTES, label: "图片" });
  if (!picked.ok) return { ok: false as const, error: picked.error };

  // 文件名 = userId + type + ext,直接覆盖旧的
  const filename = `${me.id}-${type.toLowerCase()}.${picked.upload.ext}`;
  const dir = join(UPLOAD_ROOT, "qr");
  await mkdir(dir, { recursive: true });

  // 写新文件前,把同 userId + type 但不同 ext 的旧文件清理掉(否则切扩展名时残留)
  for (const oldExt of QR_EXTS) {
    if (oldExt === picked.upload.ext) continue;
    await unlink(join(dir, `${me.id}-${type.toLowerCase()}.${oldExt}`)).catch(
      () => {}
    );
  }

  await writeFile(join(dir, filename), picked.upload.bytes);

  await db
    .update(user)
    .set({ [fieldFor(type)]: `qr/${filename}` })
    .where(eq(user.id, me.id));

  revalidatePath("/profile");
  revalidatePath("/orders");
  revalidatePath("/gifts");
  return { ok: true as const, path: `qr/${filename}` };
}

export async function deleteQrCodeAction(input: {
  type: QrType;
  securityCode?: string;
}) {
  const { user: me } = await requireSession({ role: "PLAYER" });
  if (input.type !== "WECHAT" && input.type !== "ALIPAY") {
    return { ok: false as const, error: "类型错误" };
  }
  const codeCheck = await verifyQrSecurityCode(me.id, input.securityCode ?? "");
  if (!codeCheck.ok) return codeCheck;
  const field = fieldFor(input.type);

  const [row] = await db
    .select({ path: user[field] })
    .from(user)
    .where(eq(user.id, me.id))
    .limit(1);

  if (row?.path) {
    await unlink(join(UPLOAD_ROOT, row.path)).catch(() => {});
  }

  await db.update(user).set({ [field]: null }).where(eq(user.id, me.id));
  revalidatePath("/profile");
  revalidatePath("/orders");
  revalidatePath("/gifts");
  return { ok: true as const };
}
