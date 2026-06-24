/** GET /api/mp/orders?limit= — 当前顾客的订单列表。 */
import { requireCustomer } from "@/server/mp-auth";
import { getMyOrders } from "@/server/mp-queries";

export async function GET(request: Request) {
  const auth = await requireCustomer(request);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(request.url);
  const limit = Number(searchParams.get("limit")) || undefined;

  const list = await getMyOrders(auth.customer.id, { limit });
  return Response.json({ list });
}
