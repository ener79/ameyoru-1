/** GET /api/mp/me — 当前顾客的余额 + 会员信息 + 营销资产(骰子/抽券/券数)。 */
import { requireCustomer } from "@/server/mp-auth";
import { getMyProfile, settlePlayHoursRewards } from "@/server/mp-queries";
import { getUnusedCouponCount } from "@/server/mp-assets";

export async function GET(request: Request) {
  const auth = await requireCustomer(request);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

  await settlePlayHoursRewards(auth.customer.id);
  const profile = await getMyProfile(auth.customer.id);
  if (!profile) return Response.json({ error: "账号不存在" }, { status: 401 });
  const couponCount = await getUnusedCouponCount(auth.customer.id);

  return Response.json({
    memberNo: profile.memberNo,
    name: profile.name,
    balanceCents: profile.balanceCents,
    avatarUrl: profile.mpAvatarUrl,
    diceCount: profile.diceCount,
    drawTickets: profile.drawTickets,
    couponCount,
  });
}
