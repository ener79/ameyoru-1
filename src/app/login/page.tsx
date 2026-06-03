export const dynamic = "force-dynamic";
import Image from "next/image";
import { LoginForm } from "./login-form";
import { getAllEnabledAnnouncements } from "@/server/actions/announcements";
import { getSiteSettings } from "@/server/actions/site-settings";
import { LoginAnnouncements } from "@/components/login-announcements";

export default async function LoginPage() {
  const [announcements, site] = await Promise.all([
    getAllEnabledAnnouncements(),
    getSiteSettings(),
  ]);
  const logoSrc = site.logoPath ? `/api/uploads/${site.logoPath}` : "/logo.png";
  const bannerItems = announcements.map((a) => ({
    id: a.id,
    type: a.type,
    title: a.title,
    content: a.content,
    contentJson: a.contentJson,
    imagePath: a.imagePath,
    isPermanent: a.isPermanent,
    endAt: a.endAt?.toISOString() ?? null,
  }));

  return (
    <LoginAnnouncements items={bannerItems}>
      <div className="grid min-h-svh lg:grid-cols-[1.1fr_1fr]">
        <BrandPanel siteName={site.siteName} logoSrc={logoSrc} footerText={site.footerText} />
        <FormPanel siteName={site.siteName} logoSrc={logoSrc} />
      </div>
    </LoginAnnouncements>
  );
}

function BrandPanel({ siteName, logoSrc, footerText }: { siteName: string; logoSrc: string; footerText: string | null }) {
  return (
    <div className="relative hidden overflow-hidden bg-gradient-to-br from-primary/8 via-background to-background lg:flex lg:flex-col lg:justify-between lg:px-14 lg:py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 [background:radial-gradient(800px_circle_at_30%_20%,theme(colors.primary/12%),transparent_60%),radial-gradient(600px_circle_at_80%_80%,theme(colors.chart-2/10%),transparent_60%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_right,theme(colors.border/40%)_1px,transparent_1px),linear-gradient(to_bottom,theme(colors.border/40%)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]"
      />

      <div className="relative flex items-center gap-2.5">
        <Image src={logoSrc} alt={siteName} width={36} height={36} className="rounded-xl shadow-sm" />
        <span className="text-base font-semibold tracking-tight">{siteName}</span>
      </div>

      <div className="relative space-y-3">
        <h1 className="text-4xl font-semibold tracking-tight">欢迎使用</h1>
        <p className="text-lg text-muted-foreground">
          内部管理系统
        </p>
        <div className="mt-8 flex flex-wrap gap-2">
          <FeatureChip>派单</FeatureChip>
          <FeatureChip>报单</FeatureChip>
          <FeatureChip>结算</FeatureChip>
          <FeatureChip>排行</FeatureChip>
          <FeatureChip>客户</FeatureChip>
        </div>
      </div>

      <div className="relative text-xs text-muted-foreground">
        {footerText ?? `© ${new Date().getFullYear()} ${siteName}`}
      </div>
    </div>
  );
}

function FeatureChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border bg-background/60 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
      {children}
    </span>
  );
}

function FormPanel({ siteName, logoSrc }: { siteName: string; logoSrc: string }) {
  return (
    <div className="flex items-center justify-center bg-background p-6 sm:p-10">
      <div className="w-full max-w-sm space-y-8">
        <div className="flex flex-col items-center gap-2 text-center lg:hidden">
          <Image src={logoSrc} alt={siteName} width={40} height={40} className="rounded-xl shadow-sm" />
          <span className="text-sm font-semibold tracking-tight">{siteName}</span>
        </div>

        <div className="space-y-2 text-center lg:text-left">
          <h2 className="text-2xl font-semibold tracking-tight">登录</h2>
          <p className="text-sm text-muted-foreground">
            输入店里给你的用户名和密码
          </p>
        </div>

        <LoginForm />
      </div>
    </div>
  );
}
