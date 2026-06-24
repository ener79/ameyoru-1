/** GET /api/mp/me — 当前顾客的余额 + 会员信息。 */
import { requireCustomer } from "@/server/mp-auth";
import { getMyProfile } from "@/server/mp-queries";

export async function GET(request: Request) {
  const auth = await requireCustomer(request);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

  const profile = await getMyProfile(auth.customer.id);
  if (!profile) return Response.json({ error: "账号不存在" }, { status: 401 });

  return Response.json({
    memberNo: profile.memberNo,
    name: profile.name,
    balanceCents: profile.balanceCents,
    avatarUrl: profile.mpAvatarUrl,
  });
}
