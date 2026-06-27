/** GET /api/mp/coupons — 我的卡券列表(顾客展示用)。 */
import { requireCustomer } from "@/server/mp-auth";
import { getMyCoupons } from "@/server/mp-assets";

export async function GET(request: Request) {
  const auth = await requireCustomer(request);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

  const list = await getMyCoupons(auth.customer.id);
  return Response.json({ list });
}
