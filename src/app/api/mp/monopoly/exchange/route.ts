/**
 * POST /api/mp/monopoly/exchange — 集齐五黑一键兑换下单 8 折券(各扣 1 张卡)。
 */
import { requireCustomer } from "@/server/mp-auth";
import { performExchangeCards } from "@/server/mp-monopoly";

export async function POST(request: Request) {
  const auth = await requireCustomer(request);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

  const result = await performExchangeCards(auth.customer.id);
  if (!result.ok) return Response.json({ ok: false, msg: result.msg }, { status: 409 });
  return Response.json(result);
}
