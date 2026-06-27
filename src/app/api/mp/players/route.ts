/** GET /api/mp/players — 在役陪玩列表（顾客展示用）。 */
import { requireCustomer } from "@/server/mp-auth";
import { getActivePlayers } from "@/server/mp-queries";

export async function GET(request: Request) {
  const auth = await requireCustomer(request);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

  const list = await getActivePlayers();
  return Response.json({ list });
}
