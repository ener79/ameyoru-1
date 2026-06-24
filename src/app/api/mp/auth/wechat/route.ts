/**
 * 小程序顾客微信登录。
 *
 * 流程：小程序 wx.login() 拿 code → 本接口用 code + AppID/Secret 调微信
 * jscode2session 换 openid → 按 openid 查 customer，没有就自动建档（余额0、生成会员号）
 * → 签发顾客 JWT 返回。
 *
 * 🔴 AppSecret 只在服务端用，绝不下发前端 / 进公开仓库。
 * 需要环境变量：WX_MP_APPID、WX_MP_SECRET、MP_JWT_SECRET。
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { customer } from "@/db/schema";
import { nanoid, generateMemberNo } from "@/server/id";
import { signMpToken } from "@/server/mp-auth";

type JsCodeSession = {
  openid?: string;
  unionid?: string;
  session_key?: string;
  errcode?: number;
  errmsg?: string;
};

async function code2openid(
  code: string
): Promise<{ ok: true; openid: string } | { ok: false; error: string }> {
  const appid = process.env.WX_MP_APPID;
  const secret = process.env.WX_MP_SECRET;
  if (!appid || !secret) {
    return { ok: false, error: "服务端未配置微信小程序 AppID/Secret" };
  }
  const url =
    `https://api.weixin.qq.com/sns/jscode2session?appid=${appid}` +
    `&secret=${secret}&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const data = (await res.json()) as JsCodeSession;
    if (!data.openid) {
      return {
        ok: false,
        error: `微信登录失败（${data.errcode ?? "?"}: ${data.errmsg ?? "无 openid"}）`,
      };
    }
    return { ok: true, openid: data.openid };
  } catch {
    return { ok: false, error: "微信服务请求超时，请重试" };
  }
}

export async function POST(request: Request) {
  let body: { code?: string; nickname?: string; avatarUrl?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "请求格式错误" }, { status: 400 });
  }

  const code = (body.code || "").trim();
  if (!code) return Response.json({ error: "缺少 code" }, { status: 400 });

  const wx = await code2openid(code);
  if (!wx.ok) return Response.json({ error: wx.error }, { status: 502 });

  // 按 openid 找 customer
  type Member = { id: string; memberNo: string; name: string; balanceCents: number };
  const found = await db
    .select({
      id: customer.id,
      memberNo: customer.memberNo,
      name: customer.name,
      balanceCents: customer.balanceCents,
    })
    .from(customer)
    .where(eq(customer.wechatOpenid, wx.openid))
    .limit(1);
  let row: Member | undefined = found[0];

  // 没有则自动建档（余额0、生成会员号、记录 openid + 小程序昵称/头像）
  if (!row) {
    const nickname = (body.nickname || "").trim().slice(0, 64);
    const avatarUrl = (body.avatarUrl || "").trim().slice(0, 500);
    // 会员号唯一，循环重试到不冲突（与 orders.ts 建客户逻辑一致）
    let created: Member | undefined;
    for (let i = 0; i < 5; i++) {
      const memberNo = generateMemberNo();
      const [dup] = await db
        .select({ id: customer.id })
        .from(customer)
        .where(eq(customer.memberNo, memberNo))
        .limit(1);
      if (dup) continue;
      const id = nanoid();
      const name = nickname || `微信用户${memberNo.slice(-4)}`;
      await db.insert(customer).values({
        id,
        memberNo,
        name,
        balanceCents: 0,
        wechatOpenid: wx.openid,
        mpNickname: nickname || null,
        mpAvatarUrl: avatarUrl || null,
      });
      created = { id, memberNo, name, balanceCents: 0 };
      break;
    }
    if (!created) {
      return Response.json({ error: "建档失败（会员号冲突），请重试" }, { status: 500 });
    }
    row = created;
  }

  const token = await signMpToken(row.id);
  return Response.json({
    token,
    member: {
      memberNo: row.memberNo,
      name: row.name,
      balanceCents: row.balanceCents,
    },
  });
}
