/**
 * GET  /api/mp/monopoly — 棋盘(不含 move 量)+ 骰子数 + 当前位置 + 集卡进度。
 * POST /api/mp/monopoly — 掷一次骰子(消耗 1 颗骰子)。
 */
import { requireCustomer } from "@/server/mp-auth";
import { getMonopolyView, performRoll } from "@/server/mp-monopoly";

export async function GET(request: Request) {
  const auth = await requireCustomer(request);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

  const view = await getMonopolyView(auth.customer.id);
  return Response.json(view);
}

export async function POST(request: Request) {
  const auth = await requireCustomer(request);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

  const result = await performRoll(auth.customer.id);
  if (!result.ok) return Response.json({ ok: false, msg: result.msg }, { status: 409 });
  return Response.json(result);
}
