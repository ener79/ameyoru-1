import { requireSession } from "@/lib/auth-helpers";
import { PageHeader } from "@/components/page-header";
import { getInvestorDashboard } from "@/server/investor-dashboard";
import { InvestorDashboardClient } from "./investor-dashboard-client";

export default async function InvestorDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ user }, params] = await Promise.all([requireSession(), searchParams]);

  if (user.role !== "BOSS") {
    return (
      <>
        <PageHeader title="投资人数据看板" description="仅店主账号可查看资金与利润数据" />
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          当前账号没有查看投资人数据看板的权限。
        </div>
      </>
    );
  }

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
