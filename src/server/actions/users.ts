"use server";

import { revalidatePath } from "next/cache";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { logAudit } from "@/server/audit";
import { and, eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { user, account, playerInvite, session } from "@/db/schema";
import { auth } from "@/lib/auth";
import { requireSession } from "@/lib/auth-helpers";
import { readImageUpload, type ImageUpload } from "@/lib/image-upload";
import { getAffectedRows } from "@/lib/db-utils";
import {
  DEFAULT_PLAYER_RATE_CENTS,
  INTERNAL_EMAIL_DOMAIN,
} from "@/lib/constants";
import { yuanStringToCents } from "@/lib/format";
import { qrSecurityCodeSchema } from "@/lib/qr-security";
import type { PlayerGender, Role } from "@/db/schema";
import { nanoid } from "../id";

const UPLOAD_ROOT = join(process.cwd(), "uploads");
const MAX_BYTES = 20 * 1024 * 1024;
const QR_EXTS = ["png", "jpg", "webp", "gif", "bmp", "avif", "heic", "heif"];

const usernameField = z
  .string()
  .min(2, "用户名至少 2 位")
  .max(32)
  .regex(/^[\p{L}\p{N}_.-]+$/u, "用户名只能中文/字母/数字/下划线/点/横线");

const passwordSchema = z
  .string()
  .min(9, "密码必须超过 8 位")
  .regex(/(?=.*[a-z])(?=.*[A-Z])/, "密码必须包含大小写字母");

const createPlayerSchema = z.object({
  username: usernameField,
  displayName: z.string().min(1).max(32),
  playerGender: z.enum(["MALE", "FEMALE"]),
  defaultRateYuan: z.string().optional(),
});

const createStaffSchema = z.object({
  username: usernameField,
  displayName: z.string().min(1).max(32),
});

const updatePlayerProfileSchema = z.object({
  id: z.string().min(1),
  playerGender: z.enum(["MALE", "FEMALE"]),
  defaultRateYuan: z.string().min(1),
});

const completePlayerInviteSchema = z.object({
  token: z.string().min(16),
  username: usernameField,
  displayName: z.string().min(1, "请填写名字").max(32),
  password: passwordSchema,
  qrSecurityCode: qrSecurityCodeSchema,
  playerGender: z.enum(["MALE", "FEMALE"]).optional(),
  defaultRateYuan: z.string().optional(),
});

type QrType = "WECHAT" | "ALIPAY";
const qrFieldFor = (type: QrType) =>
  type === "WECHAT" ? ("wechatQrPath" as const) : ("alipayQrPath" as const);

function getInviteQrFile(formData: FormData, type: QrType) {
  const file = formData.get(type === "WECHAT" ? "wechatQr" : "alipayQr");
  if (!(file instanceof File) || file.size === 0) return null;
  return file;
}

async function readInviteQr(formData: FormData, type: QrType) {
  const file = getInviteQrFile(formData, type);
  if (!file) return null;
  return readImageUpload(file, { maxBytes: MAX_BYTES, label: "收款码图片" });
}

async function saveInviteQr(upload: ImageUpload, userId: string, type: QrType) {
  const filename = `${userId}-${type.toLowerCase()}.${upload.ext}`;
  const dir = join(UPLOAD_ROOT, "qr");
  await mkdir(dir, { recursive: true });

  for (const oldExt of QR_EXTS) {
    if (oldExt === upload.ext) continue;
    await unlink(join(dir, `${userId}-${type.toLowerCase()}.${oldExt}`)).catch(
      () => {}
    );
  }

  await writeFile(join(dir, filename), upload.bytes);

  await db
    .update(user)
    .set({ [qrFieldFor(type)]: `qr/${filename}` })
    .where(eq(user.id, userId));
}

/** 8 位易读随机密码,无易混淆字符(i l o 0 1) */
function generateInitialPassword(): string {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += chars[b % chars.length];
  return out;
}

type CreateResult =
  | { ok: true; initialPassword: string; username: string; displayName: string }
  | { ok: false; error: string };

async function createUser(opts: {
  username: string;
  displayName: string;
  role: Role;
  defaultRateCents?: number;
  playerGender?: PlayerGender;
  password?: string;
  mustChangePwd?: boolean;
  qrSecurityCodeHash?: string;
}): Promise<CreateResult> {
  const {
    username,
    displayName,
    role,
    defaultRateCents,
    playerGender,
    password,
    mustChangePwd = true,
    qrSecurityCodeHash,
  } = opts;

  const [dup] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.username, username))
    .limit(1);
  if (dup) return { ok: false, error: "用户名已存在" };

  const initialPassword = password ?? generateInitialPassword();
  const ctx = await auth.$context;
  const passwordHash = await ctx.password.hash(initialPassword);

  try {
    const createdUser = await ctx.internalAdapter.createUser({
      email: `${nanoid(12)}@${INTERNAL_EMAIL_DOMAIN}`,
      name: displayName,
      emailVerified: true,
      username,
      displayUsername: username,
      role,
      defaultRateCents: defaultRateCents ?? null,
      playerGender: playerGender ?? null,
      mustChangePwd,
      qrSecurityCodeHash: qrSecurityCodeHash ?? null,
    });
    if (!createdUser?.id) {
      return { ok: false, error: "创建失败" };
    }

    try {
      await ctx.internalAdapter.createAccount({
        userId: createdUser.id,
        providerId: "credential",
        accountId: createdUser.id,
        password: passwordHash,
      });
    } catch (e) {
      await db.delete(user).where(eq(user.id, createdUser.id)).catch(() => {});
      throw e;
    }
  } catch (e) {
    const [existing] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.username, username))
      .limit(1);
    if (existing) {
      return { ok: false, error: "用户名已存在" };
    }

    return {
      ok: false,
      error: e instanceof Error ? e.message : "创建失败",
    };
  }

  return { ok: true, initialPassword, username, displayName };
}

export async function createPlayerAction(
  input: z.infer<typeof createPlayerSchema>
): Promise<CreateResult> {
  const { user: me } = await requireSession({ role: ["BOSS", "STAFF"] });
  const parsed = createPlayerSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? "参数错误" };
  }
  const { username, displayName, playerGender, defaultRateYuan } = parsed.data;
  const defaultRateCents = defaultRateYuan
    ? yuanStringToCents(defaultRateYuan)
    : DEFAULT_PLAYER_RATE_CENTS;
  const res = await createUser({
    username,
    displayName,
    role: "PLAYER",
    defaultRateCents,
    playerGender,
  });
  if (res.ok) {
    logAudit({ actorId: me.id, actorName: me.name, action: "CREATE_PLAYER", targetType: "user", detail: { username, displayName } });
    revalidatePath("/players");
    revalidatePath("/leaderboard");
  }
  return res;
}

export async function updatePlayerProfileAction(
  input: z.infer<typeof updatePlayerProfileSchema>
) {
  await requireSession({ role: ["BOSS", "STAFF"] });
  const parsed = updatePlayerProfileSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.errors[0]?.message ?? "参数错误" };
  }

  const defaultRateCents = yuanStringToCents(parsed.data.defaultRateYuan);
  if (defaultRateCents <= 0) {
    return { ok: false as const, error: "默认单价必须大于 0" };
  }

  const [target] = await db
    .select({ role: user.role })
    .from(user)
    .where(eq(user.id, parsed.data.id))
    .limit(1);
  if (!target || target.role !== "PLAYER") {
    return { ok: false as const, error: "陪玩不存在" };
  }

  await db
    .update(user)
    .set({
      playerGender: parsed.data.playerGender,
      defaultRateCents,
    })
    .where(eq(user.id, parsed.data.id));

  revalidatePath("/players");
  revalidatePath("/orders/new");
  return { ok: true as const };
}

export async function createStaffAction(
  input: z.infer<typeof createStaffSchema>
): Promise<CreateResult> {
  // 仅 BOSS 可创建店长账号(STAFF 之间互不能管理)
  await requireSession({ role: "BOSS" });
  const parsed = createStaffSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? "参数错误" };
  }
  const res = await createUser({
    username: parsed.data.username,
    displayName: parsed.data.displayName,
    role: "STAFF",
  });
  if (res.ok) revalidatePath("/staff");
  return res;
}

export async function toggleUserActiveAction(input: {
  id: string;
  active: boolean;
}) {
  const { user: me } = await requireSession({ role: ["BOSS", "STAFF"] });
  if (input.id === me.id) {
    return { ok: false as const, error: "不能停用自己的账号" };
  }

  const [target] = await db
    .select({ role: user.role, name: user.name, username: user.username })
    .from(user)
    .where(eq(user.id, input.id))
    .limit(1);
  if (!target || target.role === "BOSS") {
    return { ok: false as const, error: "目标账号不存在或无权操作" };
  }
  // STAFF 之间互不能停用,只有 BOSS 能管理店长账号
  if (target.role === "STAFF" && me.role !== "BOSS") {
    return { ok: false as const, error: "只有店主可以管理店长账号" };
  }

  await db
    .update(user)
    .set({ active: input.active })
    .where(eq(user.id, input.id));
  if (!input.active) {
    await db.delete(session).where(eq(session.userId, input.id));
  }
  logAudit({ actorId: me.id, actorName: me.name, action: input.active ? "ENABLE_USER" : "DISABLE_USER", targetType: "user", targetId: input.id, detail: { userName: target.name, username: target.username } });
  revalidatePath("/players");
  revalidatePath("/staff");
  return { ok: true as const };
}

export async function deleteStaffAction(input: { id: string }) {
  // 仅 BOSS 可删除店长账号(STAFF 只能停用,见 toggleUserActiveAction)
  const { user: me } = await requireSession({ role: "BOSS" });
  if (input.id === me.id) {
    return { ok: false as const, error: "不能删除自己的账号" };
  }

  const [target] = await db
    .select({ role: user.role })
    .from(user)
    .where(eq(user.id, input.id))
    .limit(1);
  if (!target) {
    return { ok: false as const, error: "账号不存在" };
  }
  if (target.role !== "STAFF") {
    return { ok: false as const, error: "只能删除店长账号" };
  }

  try {
    // session/account 表外键带 onDelete:cascade,会自动清理。
    // 业务表(order/playerInvite/customerBalanceTxn)外键无 cascade,
    // 一旦有关联记录会触发 SQLite FK 约束抛错,转成"只能停用"提示。
    await db.delete(user).where(eq(user.id, input.id));
  } catch {
    return {
      ok: false as const,
      error: "该店长已有业务记录(订单/邀请/预存),只能停用,无法删除",
    };
  }

  revalidatePath("/staff");
  return { ok: true as const };
}

export async function resetUserPasswordAction(input: {
  id: string;
}): Promise<
  { ok: true; newPassword: string } | { ok: false; error: string }
> {
  const { user: me } = await requireSession({ role: ["BOSS", "STAFF"] });

  const [target] = await db
    .select({ role: user.role })
    .from(user)
    .where(eq(user.id, input.id))
    .limit(1);
  if (!target || target.role === "BOSS") {
    return { ok: false, error: "目标账号不存在或无权操作" };
  }
  // STAFF 不能重置其他 STAFF 的密码(等价于踢出账号,只有 BOSS 能做)
  if (target.role === "STAFF" && me.role !== "BOSS") {
    return { ok: false, error: "只有店主可以管理店长账号" };
  }

  const newPassword = generateInitialPassword();
  const ctx = await auth.$context;
  const hash = await ctx.password.hash(newPassword);

  await db
    .update(account)
    .set({ password: hash })
    .where(
      and(eq(account.userId, input.id), eq(account.providerId, "credential"))
    );
  await db
    .update(user)
    .set({ mustChangePwd: true })
    .where(eq(user.id, input.id));

  revalidatePath("/players");
  revalidatePath("/staff");
  return { ok: true, newPassword };
}

export async function resetPlayerQrSecurityCodeAction(input: {
  id: string;
  securityCode: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireSession({ role: ["BOSS", "STAFF"] });

  const parsed = z
    .object({
      id: z.string().min(1),
      securityCode: qrSecurityCodeSchema,
    })
    .safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? "参数错误" };
  }

  const [target] = await db
    .select({ role: user.role })
    .from(user)
    .where(eq(user.id, parsed.data.id))
    .limit(1);
  if (!target || target.role !== "PLAYER") {
    return { ok: false, error: "陪玩不存在" };
  }

  const ctx = await auth.$context;
  const hash = await ctx.password.hash(parsed.data.securityCode);

  await db
    .update(user)
    .set({ qrSecurityCodeHash: hash })
    .where(eq(user.id, parsed.data.id));

  revalidatePath("/players");

  return { ok: true };
}

export async function completePlayerInviteAction(
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  const raw = {
    token: String(formData.get("token") ?? ""),
    username: String(formData.get("username") ?? ""),
    displayName: String(formData.get("displayName") ?? ""),
    password: String(formData.get("password") ?? ""),
    qrSecurityCode: String(formData.get("qrSecurityCode") ?? ""),
    playerGender: formData.get("playerGender") || undefined,
    defaultRateYuan: String(formData.get("defaultRateYuan") ?? ""),
  };
  const parsed = completePlayerInviteSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? "参数错误" };
  }

  const [invite] = await db
    .select({
      id: playerInvite.id,
      playerGender: playerInvite.playerGender,
      defaultRateCents: playerInvite.defaultRateCents,
      expiresAt: playerInvite.expiresAt,
      usedAt: playerInvite.usedAt,
      maxUses: playerInvite.maxUses,
      useCount: playerInvite.useCount,
    })
    .from(playerInvite)
    .where(eq(playerInvite.inviteToken, parsed.data.token))
    .limit(1);
  if (!invite) return { ok: false, error: "链接不存在" };
  // multi-use check
  if (invite.maxUses > 0 && invite.useCount >= invite.maxUses) {
    return { ok: false, error: "链接已达使用上限" };
  }
  if (invite.expiresAt.getTime() < Date.now()) {
    return { ok: false, error: "链接已过期" };
  }
  const inviteId = invite.id;

  const defaultRateCents = parsed.data.defaultRateYuan
    ? yuanStringToCents(parsed.data.defaultRateYuan)
    : invite.defaultRateCents ?? DEFAULT_PLAYER_RATE_CENTS;
  if (defaultRateCents <= 0) {
    return { ok: false, error: "默认单价必须大于 0" };
  }
  if (parsed.data.qrSecurityCode === parsed.data.password) {
    return { ok: false, error: "安全码不能和登录密码一样" };
  }
  const ctx = await auth.$context;
  const qrSecurityCodeHash = await ctx.password.hash(
    parsed.data.qrSecurityCode
  );

  const wechatUpload = await readInviteQr(formData, "WECHAT");
  if (!wechatUpload) return { ok: false, error: "请上传微信收款码" };
  if (!wechatUpload.ok) return { ok: false, error: wechatUpload.error };

  const alipayUpload = await readInviteQr(formData, "ALIPAY");
  if (!alipayUpload) return { ok: false, error: "请上传支付宝收款码" };
  if (!alipayUpload.ok) return { ok: false, error: alipayUpload.error };

  const res = await createUser({
    username: parsed.data.username,
    displayName: parsed.data.displayName,
    role: "PLAYER",
    defaultRateCents,
    playerGender:
      parsed.data.playerGender ?? invite.playerGender ?? "FEMALE",
    password: parsed.data.password,
    mustChangePwd: false,
    qrSecurityCodeHash,
  });
  if (!res.ok) {
    return res;
  }

  const [created] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.username, parsed.data.username))
    .limit(1);
  if (!created) {
    return { ok: false, error: "创建失败" };
  }

  const consumeResult = await db
    .update(playerInvite)
    .set({
      useCount: sql`${playerInvite.useCount} + 1`,
      usedAt: new Date(),
      usedById: created.id,
    })
    .where(
      and(
        eq(playerInvite.id, inviteId),
        sql`${playerInvite.expiresAt} >= ${new Date()}`,
        sql`(${playerInvite.maxUses} = 0 OR ${playerInvite.useCount} < ${playerInvite.maxUses})`
      )
    );
  if (getAffectedRows(consumeResult) !== 1) {
    await db.delete(user).where(eq(user.id, created.id));
    return { ok: false, error: "链接已达使用上限或已过期" };
  }

  await saveInviteQr(wechatUpload.upload, created.id, "WECHAT");
  await saveInviteQr(alipayUpload.upload, created.id, "ALIPAY");

  revalidatePath("/players");

  return { ok: true };
}

export async function toggleDepositAction(input: { id: string; depositPaid: boolean }) {
  const { user: me } = await requireSession({ role: ["BOSS", "STAFF"] });
  const [target] = await db.select({ name: user.name, username: user.username, role: user.role }).from(user).where(eq(user.id, input.id)).limit(1);
  if (!target || target.role !== "PLAYER") {
    return { ok: false as const, error: "只能操作陪玩的押金状态" };
  }
  await db.update(user).set({ depositPaid: input.depositPaid }).where(eq(user.id, input.id));
  logAudit({ actorId: me.id, actorName: me.name, action: input.depositPaid ? "MARK_DEPOSIT_PAID" : "MARK_DEPOSIT_UNPAID", targetType: "user", targetId: input.id, detail: target ? { userName: target.name, username: target.username } : undefined });
  revalidatePath("/players");
  return { ok: true as const };
}
