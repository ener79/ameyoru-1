/** GET /api/mp/transactions?limit=&before= — 当前顾客的余额流水（游标分页）。 */
import { requireCustomer } from "@/server/mp-auth";
import { getMyTransactions } from "@/server/mp-queries";

export async function GET(request: Request) {
  const auth = await requireCustomer(request);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(request.url);
  const limit = Number(searchParams.get("limit")) || undefined;
  const before = searchParams.get("before") || undefined;

  const list = await getMyTransactions(auth.customer.id, { limit, before });
  return Response.json({ list });
}
