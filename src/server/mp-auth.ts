/**
 * 小程序顾客端鉴权（与店员 better-auth 完全隔离）。
 *
 * 为什么自管一套：better-auth 的 user 是店内人员（BOSS/STAFF/SERVICE/PLAYER），
 * 顾客（customer 表）根本不在 better-auth 体系内。给顾客单独签一个轻量 JWT，
 * 顾客 token 只能访问 /api/mp/* 顾客接口，物理隔离于商家端，杜绝越权。
 *
 * token 用 jose（better-auth 已带此依赖）以 HS256 + MP_JWT_SECRET 签名。
 * MP_JWT_SECRET 必须与 BETTER_AUTH_SECRET 不同，避免两套 token 互通。
 */
import { SignJWT, jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { customer } from "@/db/schema";

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 天

function getSecret(): Uint8Array {
  const secret = process.env.MP_JWT_SECRET;
  if (!secret) {
    throw new Error("MP_JWT_SECRET is not set（小程序顾客 token 签名密钥）");
  }
  return new TextEncoder().encode(secret);
}

/** 给顾客签发 JWT，载荷只含 customerId。 */
export async function signMpToken(customerId: string): Promise<string> {
  return new SignJWT({ sub: customerId, kind: "mp-customer" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_TTL_SECONDS}s`)
    .sign(getSecret());
}

/** 从 token 解出 customerId，验签 + 过期校验。失败返回 null。 */
async function customerIdFromToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (payload.kind !== "mp-customer") return null;
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

/** 从请求头取 Bearer token。 */
function bearerToken(request: Request): string | null {
  const h = request.headers.get("authorization") || "";
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1] : null;
}

export type MpCustomer = {
  id: string;
  memberNo: string;
  name: string;
  balanceCents: number;
};

/**
 * 顾客接口的统一鉴权入口。校验 token → 查 customer 确认存在。
 * 成功返回顾客信息；失败返回 { error, status }，由 route 直接 Response.json 出去。
 */
export async function requireCustomer(
  request: Request
): Promise<
  | { ok: true; customer: MpCustomer }
  | { ok: false; status: number; error: string }
> {
  const token = bearerToken(request);
  if (!token) return { ok: false, status: 401, error: "未登录" };

  const customerId = await customerIdFromToken(token);
  if (!customerId) return { ok: false, status: 401, error: "登录已失效" };

  const [row] = await db
    .select({
      id: customer.id,
      memberNo: customer.memberNo,
      name: customer.name,
      balanceCents: customer.balanceCents,
    })
    .from(customer)
    .where(eq(customer.id, customerId))
    .limit(1);

  if (!row) return { ok: false, status: 401, error: "账号不存在" };
  return { ok: true, customer: row };
}
