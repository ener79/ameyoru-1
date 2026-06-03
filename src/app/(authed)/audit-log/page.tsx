import { requireSession } from "@/lib/auth-helpers";
import { db } from "@/db";
import { auditLog } from "@/db/schema";
import { desc } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { ClipboardList } from "lucide-react";
import { formatRelativeDateTime } from "@/lib/format";

type BadgeVariant =
  | "default"
  | "secondary"
  | "destructive"
  | "success"
  | "warning"
  | "outline";

const ACTION_LABEL: Record<string, string> = {
  CREATE_ORDER: "创建订单",
  COMPLETE_ORDER: "标记完成",
  SETTLE_ORDER: "结算",
  UNSETTLE_ORDER: "撤销结算",
  CANCEL_ORDER: "取消订单",
  CREATE_USER: "创建账号",
  UPDATE_USER: "修改账号",
  TOGGLE_USER: "启用/停用",
  CREATE_ANNOUNCEMENT: "创建公告",
  UPDATE_ANNOUNCEMENT: "修改公告",
  DELETE_ANNOUNCEMENT: "删除公告",
  TOGGLE_ANNOUNCEMENT: "切换公告",
  CREATE_PLAYER: "创建陪玩",
  ENABLE_USER: "启用用户",
  DISABLE_USER: "停用用户",
  BATCH_SETTLE: "批量结算",
  ADJUST_ORDER_DURATION: "调整时长",
  MARK_DEPOSIT_PAID: "标记已缴押金",
  MARK_DEPOSIT_UNPAID: "取消押金标记",
  CREATE_PLAYER_INVITE: "创建邀请链接",
  DELETE_PLAYER_INVITE: "删除邀请链接",
  ENABLE_ANNOUNCEMENT: "启用公告",
  DISABLE_ANNOUNCEMENT: "禁用公告",
  CREATE_GIFT_RECORD: "添加礼物记录",
  CREATE_GIFT_REPORT: "提交礼物报单",
  UPDATE_GIFT_RECORD: "修改礼物记录",
  DELETE_GIFT_RECORD: "删除礼物记录",
  SETTLE_GIFT: "支付礼物",
  UNSETTLE_GIFT: "撤销礼物支付",
};

const ACTION_COLOR: Record<string, BadgeVariant> = {
  CREATE_ORDER: "default",
  COMPLETE_ORDER: "secondary",
  SETTLE_ORDER: "success",
  CANCEL_ORDER: "destructive",
  UNSETTLE_ORDER: "outline",
  CREATE_USER: "default",
  UPDATE_USER: "secondary",
  TOGGLE_USER: "outline",
  CREATE_ANNOUNCEMENT: "default",
  UPDATE_ANNOUNCEMENT: "secondary",
  DELETE_ANNOUNCEMENT: "destructive",
  TOGGLE_ANNOUNCEMENT: "outline",
  CREATE_PLAYER: "default",
  ENABLE_USER: "success",
  DISABLE_USER: "destructive",
  BATCH_SETTLE: "success",
  ADJUST_ORDER_DURATION: "secondary",
  MARK_DEPOSIT_PAID: "success",
  MARK_DEPOSIT_UNPAID: "outline",
  CREATE_PLAYER_INVITE: "default",
  DELETE_PLAYER_INVITE: "destructive",
  ENABLE_ANNOUNCEMENT: "success",
  DISABLE_ANNOUNCEMENT: "destructive",
  CREATE_GIFT_RECORD: "default",
  CREATE_GIFT_REPORT: "default",
  UPDATE_GIFT_RECORD: "secondary",
  DELETE_GIFT_RECORD: "destructive",
  SETTLE_GIFT: "success",
  UNSETTLE_GIFT: "outline",
};

export default async function AuditLogPage() {
  await requireSession({ role: ["BOSS"] });

  const logs = await db
    .select()
    .from(auditLog)
    .orderBy(desc(auditLog.createdAt))
    .limit(300);

  return (
    <>
      <PageHeader title="操作日志" description="最近 300 条操作记录" />
      {logs.length === 0 ? (
        <EmptyState icon={<ClipboardList />} title="暂无操作记录" />
      ) : (
        <Card className="overflow-hidden p-0">
          <ul className="divide-y text-sm">
            {logs.map((log) => {
              let detail: Record<string, unknown> = {};
              try { detail = log.detail ? JSON.parse(log.detail) : {}; } catch {}
              return (
                <li key={log.id} className="flex items-start gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{log.actorName}</span>
                      <Badge variant={ACTION_COLOR[log.action] ?? "outline"} className="text-[10px]">
                        {ACTION_LABEL[log.action] ?? log.action}
                      </Badge>
                      {log.targetId && (
                        <span className="text-muted-foreground font-mono text-[10px]">{log.targetId.slice(0, 8)}…</span>
                      )}
                    </div>
                    {Object.keys(detail).length > 0 && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {Object.entries(detail).map(([k, v]) => `${k}: ${v}`).join(" · ")}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0 mt-0.5">
                    {formatRelativeDateTime(log.createdAt)}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </>
  );
}
