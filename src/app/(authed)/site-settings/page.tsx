import { requireSession } from "@/lib/auth-helpers";
import { getSiteSettings } from "@/server/actions/site-settings";
import { PageHeader } from "@/components/page-header";
import { SiteSettingsForm } from "./site-settings-form";

export default async function SiteSettingsPage() {
  await requireSession({ role: ["BOSS", "STAFF"] });
  const settings = await getSiteSettings();

  return (
    <>
      <PageHeader title="站点设置" description="配置站点名称、Logo、主题色等" />
      <SiteSettingsForm settings={settings} />
    </>
  );
}
