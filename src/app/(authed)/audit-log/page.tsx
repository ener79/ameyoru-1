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
};

const ACTION_COLOR: Record<string, string> = {
  CREATE_ORDER: "default",
  COMPLETE_ORDER: "secondary",
  SETTLE_ORDER: "default",
  CANCEL_ORDER: "destructive",
  UNSETTLE_ORDER: "outline",
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
                      <Badge variant={(ACTION_COLOR[log.action] as "default" | "secondary" | "destructive" | "outline") ?? "outline"} className="text-[10px]">
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
