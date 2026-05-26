import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { user as userTable } from "@/db/schema";
import { auth } from "./auth";
import type { Role } from "@/db/schema";

interface AuthedUser {
  id: string;
  name: string;
  username: string;
  role: Role;
  active: boolean;
  mustChangePwd: boolean;
}

function normalizeUser(raw: unknown): AuthedUser {
  const u = raw as {
    id: string;
    name: string;
    username?: string | null;
    role: Role;
    active?: boolean | null;
    mustChangePwd?: boolean | null;
  };
  return {
    id: u.id,
    name: u.name,
    username: u.username ?? "",
    role: u.role,
    active: !!u.active,
    mustChangePwd: !!u.mustChangePwd,
  };
}

async function getFreshUser(id: string) {
  return db
    .select({
      id: userTable.id,
      name: userTable.name,
      username: userTable.username,
      role: userTable.role,
      active: userTable.active,
      mustChangePwd: userTable.mustChangePwd,
    })
    .from(userTable)
    .where(eq(userTable.id, id))
    .get();
}

/**
 * 在 server component / server action 中拿当前 session。
 * 同时做角色守卫和强制改密重定向。
 *
 * - `role` 可为单个 Role 或 Role 数组,表示允许的角色;不在内则跳 `/`。
 */
export async function requireSession(opts?: {
  role?: Role | Role[];
  allowMustChangePwd?: boolean;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  // session cookie 存在但 DB 里查不到 user(被删 / session 表清空 / DB 重建),
  // 必须带 ?stale=1,否则 middleware 会因 cookie 还在又把 /login 跳回 /,死循环。
  if (!session?.user) redirect("/login?stale=1");

  const freshUser = await getFreshUser(session.user.id);
  if (!freshUser?.active) redirect("/login?inactive=1");

  const user = normalizeUser(freshUser);
  if (user.mustChangePwd && !opts?.allowMustChangePwd) {
    redirect("/change-password");
  }
  if (opts?.role) {
    const allowed = Array.isArray(opts.role) ? opts.role : [opts.role];
    if (!allowed.includes(user.role)) redirect("/");
  }
  return { session, user };
}

export async function getOptionalSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;

  const freshUser = await getFreshUser(session.user.id);
  if (!freshUser?.active) return null;

  return {
    ...session,
    user: {
      ...session.user,
      ...freshUser,
    },
  };
}

/** 是否拥有"管理"权限(BOSS / STAFF 都算) */
export function isStaffOrBoss(role: Role): boolean {
  return role === "BOSS" || role === "STAFF";
}
