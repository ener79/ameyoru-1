/**
 * GET  /api/mp/wheel — 转盘奖池(不含权重)+ 当前抽券次数。
 * POST /api/mp/wheel — 抽一次(消耗 1 次抽券)。
 */
import { requireCustomer } from "@/server/mp-auth";
import { getWheelView, performDraw } from "@/server/mp-wheel";

export async function GET(request: Request) {
  const auth = await requireCustomer(request);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

  const view = await getWheelView(auth.customer.id);
  return Response.json(view);
}

export async function POST(request: Request) {
  const auth = await requireCustomer(request);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

  const result = await performDraw(auth.customer.id);
  if (!result.ok) return Response.json({ ok: false, msg: result.msg }, { status: 409 });
  return Response.json(result);
}
