/** GET /api/mp/price-tiers — 陪玩价目档位（按性别分组，单位分/小时）。 */
import { requireCustomer } from "@/server/mp-auth";
import { PRICE_BUCKETS_CENTS } from "@/lib/constants";

export async function GET(request: Request) {
  const auth = await requireCustomer(request);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

  return Response.json(PRICE_BUCKETS_CENTS);
}
