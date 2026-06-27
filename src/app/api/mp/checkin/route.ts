/**
 * GET  /api/mp/checkin — 签到状态（今天是否已签、连续天数、奖励表）。
 * POST /api/mp/checkin — 执行签到，返回签到天数。
 */
import { requireCustomer } from "@/server/mp-auth";
import { getCheckinStatus, performCheckin } from "@/server/mp-queries";
import { CHECKIN_REWARDS } from "@/lib/constants";

export async function GET(request: Request) {
  const auth = await requireCustomer(request);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

  const status = await getCheckinStatus(auth.customer.id);
  if (!status) return Response.json({ error: "账号不存在" }, { status: 401 });

  return Response.json({ ...status, rewards: CHECKIN_REWARDS });
}

export async function POST(request: Request) {
  const auth = await requireCustomer(request);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

  const result = await performCheckin(auth.customer.id);
  if (!result.ok) return Response.json({ ok: false, msg: result.msg }, { status: 409 });

  const reward = CHECKIN_REWARDS[result.day - 1];
  return Response.json({ ok: true, day: result.day, reward });
}
