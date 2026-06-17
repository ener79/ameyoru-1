import { requireSession } from "@/lib/auth-helpers";
import { getInvestorDashboard } from "@/server/investor-dashboard";
import { InvestorDashboardClient } from "./investor-dashboard-client";

export default async function InvestorDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [, params] = await Promise.all([
    requireSession({ role: "BOSS" }),
    searchParams,
  ]);

  const payload = await getInvestorDashboard({
    preset: readParam(params.preset),
    from: readParam(params.from),
    to: readParam(params.to),
  });

  return <InvestorDashboardClient payload={payload} />;
}

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
