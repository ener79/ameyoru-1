import Link from "next/link";
import { eq } from "drizzle-orm";
import { AlertCircle, KeyRound } from "lucide-react";
import { db } from "@/db";
import { user } from "@/db/schema";
import { requireSession } from "@/lib/auth-helpers";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { avatarInitial, formatDate, formatYuan } from "@/lib/format";
import type { Role } from "@/db/schema";
import { ProfileEditForm } from "./profile-edit-form";
import { QrUploadSection } from "./qr-upload-section";

const roleLabel: Record<Role, string> = {
  BOSS: "店主",
  STAFF: "员工",
  PLAYER: "陪玩",
};

export default async function ProfilePage() {
  const { user: me } = await requireSession();

  const [profile] = await db
    .select({
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role,
      defaultRateCents: user.defaultRateCents,
      createdAt: user.createdAt,
      wechatQrPath: user.wechatQrPath,
      alipayQrPath: user.alipayQrPath,
      qrSecurityCodeHash: user.qrSecurityCodeHash,
    })
    .from(user)
    .where(eq(user.id, me.id))
    .limit(1);

  if (!profile) return null;

  const isPlayer = profile.role === "PLAYER";
  const hasQrCode = !!(profile.wechatQrPath || profile.alipayQrPath);

  return (
    <>
      <PageHeader title="我的资料" description="个人账号信息" />

      <div className="space-y-6">
        <Card className="overflow-hidden p-0">
          <div className="flex items-center gap-4 border-b bg-muted/30 px-6 py-5">
            <Avatar className="size-14 ring-2 ring-background ring-offset-2 ring-offset-primary/20">
              <AvatarFallback className="bg-primary/10 text-primary text-lg font-semibold">
                {avatarInitial(profile.name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-lg font-semibold">{profile.name}</span>
                <Badge variant="secondary">{roleLabel[profile.role as Role]}</Badge>
              </div>
              <div className="mt-0.5 text-sm text-muted-foreground">
                @{profile.username ?? "—"}
              </div>
            </div>
          </div>

          <ul className="divide-y">
            <InfoRow label="登录账号" value={profile.username ?? "—"} mono />
            <InfoRow label="显示名" value={profile.name} />
            <InfoRow label="职位" value={roleLabel[profile.role as Role]} />
            {isPlayer && (
              <InfoRow
                label="默认单价"
                value={
                  profile.defaultRateCents != null
                    ? `${formatYuan(profile.defaultRateCents)} / 小时`
                    : "—"
                }
                hint="老板设定,如需调整请联系老板"
              />
            )}
            <InfoRow label="注册时间" value={formatDate(profile.createdAt)} />
          </ul>
        </Card>

        <Card className="p-6 space-y-4">
          <div>
            <h2 className="text-base font-semibold">修改资料</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              修改你的显示名和登录用户名
            </p>
          </div>
          <ProfileEditForm
            initialName={profile.name}
            initialUsername={profile.username ?? ""}
          />
        </Card>

        <Card className="p-6 space-y-4">
          <div>
            <h2 className="text-base font-semibold">安全</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              定期修改密码以保护账号
            </p>
          </div>
          <Button asChild variant="outline" className="w-full sm:w-auto">
            <Link href="/change-password">
              <KeyRound /> 修改密码
            </Link>
          </Button>
        </Card>

        {isPlayer && (
          <Card
            className={
              hasQrCode
                ? "p-6 space-y-4"
                : "p-6 space-y-4 border-warning/40 bg-warning/5"
            }
          >
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold">收款码</h2>
                {!hasQrCode && (
                  <Badge variant="warning">
                    <AlertCircle /> 还没上传收款码
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {hasQrCode
                  ? "上传后,老板在订单详情可直接扫码打款。更换或删除需要收款码安全码。最大 20MB,支持常见图片格式"
                  : "请先上传微信或支付宝收款码,否则老板只能线下确认打款。更换或删除需要收款码安全码。最大 20MB,支持常见图片格式"}
              </p>
            </div>
            <QrUploadSection
              wechatPath={profile.wechatQrPath}
              alipayPath={profile.alipayQrPath}
              hasSecurityCode={!!profile.qrSecurityCodeHash}
            />
          </Card>
        )}
      </div>
    </>
  );
}

function InfoRow({
  label,
  value,
  hint,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  mono?: boolean;
}) {
  return (
    <li className="flex items-start justify-between gap-4 px-6 py-3.5">
      <span className="shrink-0 text-sm text-muted-foreground">{label}</span>
      <span className="text-right">
        <span
          className={
            mono
              ? "block font-mono text-sm font-medium"
              : "block text-sm font-medium"
          }
        >
          {value}
        </span>
        {hint && (
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {hint}
          </span>
        )}
      </span>
    </li>
  );
}
