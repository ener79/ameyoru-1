import { requireSession } from "@/lib/auth-helpers";
import { db } from "@/db";
import { auditLog } from "@/db/schema";
import { desc } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { ClipboardList } from "lucide-react";
import { formatRelativeDateTime, formatYuan, formatDuration } from "@/lib/format";

/**
 * 审计日志动作码。这是「写入端」的真实来源——所有取值由
 * src/server/actions/*.ts 中 `logAudit({ action: ... })` 实际发出的字面量
 * 决定(含三元分支的两端)。新增/删除动作码时,务必同步本联合类型与下方两张
 * 映射表(TS 会在缺漏时报错,因为两表均为 Record<AuditAction, ...>)。
 */
type AuditAction =
  // orders.ts
  | "CREATE_ORDER"
  | "COMPLETE_ORDER"
  | "ADJUST_ORDER_DURATION"
  | "CANCEL_ORDER"
  | "SETTLE_ORDER"
  | "UNSETTLE_ORDER"
  | "BATCH_SETTLE"
  // users.ts
  | "CREATE_PLAYER"
  | "ENABLE_USER"
  | "DISABLE_USER"
  | "MARK_DEPOSIT_PAID"
  | "MARK_DEPOSIT_UNPAID"
  // announcements.ts
  | "CREATE_ANNOUNCEMENT"
  | "UPDATE_ANNOUNCEMENT"
  | "DELETE_ANNOUNCEMENT"
  | "ENABLE_ANNOUNCEMENT"
  | "DISABLE_ANNOUNCEMENT"
  // gifts.ts
  | "CREATE_GIFT_RECORD"
  | "CREATE_GIFT_REPORT"
  | "UPDATE_GIFT_RECORD"
  | "DELETE_GIFT_RECORD"
  | "SETTLE_GIFT"
  | "UNSETTLE_GIFT";

/** Badge 组件真实支持的 variant 联合(见 src/components/ui/badge.tsx) */
type BadgeVariant =
  | "default"
  | "secondary"
  | "destructive"
  | "success"
  | "warning"
  | "outline";

const ACTION_LABEL: Record<AuditAction, string> = {
  CREATE_ORDER: "创建订单",
  COMPLETE_ORDER: "标记完成",
  ADJUST_ORDER_DURATION: "调整时长",
  CANCEL_ORDER: "取消订单",
  SETTLE_ORDER: "结算",
  UNSETTLE_ORDER: "撤销结算",
  BATCH_SETTLE: "批量结算",
  CREATE_PLAYER: "创建陪玩",
  ENABLE_USER: "启用用户",
  DISABLE_USER: "停用用户",
  MARK_DEPOSIT_PAID: "标记已缴押金",
  MARK_DEPOSIT_UNPAID: "取消押金标记",
  CREATE_ANNOUNCEMENT: "创建公告",
  UPDATE_ANNOUNCEMENT: "修改公告",
  DELETE_ANNOUNCEMENT: "删除公告",
  ENABLE_ANNOUNCEMENT: "启用公告",
  DISABLE_ANNOUNCEMENT: "禁用公告",
  CREATE_GIFT_RECORD: "添加礼物记录",
  CREATE_GIFT_REPORT: "上报礼物",
  UPDATE_GIFT_RECORD: "修改礼物记录",
  DELETE_GIFT_RECORD: "删除礼物记录",
  SETTLE_GIFT: "礼物结算",
  UNSETTLE_GIFT: "撤销礼物结算",
};

const ACTION_COLOR: Record<AuditAction, BadgeVariant> = {
  // 创建 / 启用 / 正向操作
  CREATE_ORDER: "default",
  CREATE_PLAYER: "default",
  ENABLE_USER: "default",
  MARK_DEPOSIT_PAID: "default",
  CREATE_ANNOUNCEMENT: "default",
  ENABLE_ANNOUNCEMENT: "default",
  CREATE_GIFT_RECORD: "default",
  CREATE_GIFT_REPORT: "default",
  // 结算 / 完成
  COMPLETE_ORDER: "secondary",
  SETTLE_ORDER: "secondary",
  BATCH_SETTLE: "secondary",
  SETTLE_GIFT: "secondary",
  // 删除 / 取消 / 停用(破坏性)
  CANCEL_ORDER: "destructive",
  DISABLE_USER: "destructive",
  DELETE_ANNOUNCEMENT: "destructive",
  DISABLE_ANNOUNCEMENT: "destructive",
  DELETE_GIFT_RECORD: "destructive",
  // 修改 / 撤销 / 中性
  ADJUST_ORDER_DURATION: "outline",
  UNSETTLE_ORDER: "outline",
  MARK_DEPOSIT_UNPAID: "outline",
  UPDATE_ANNOUNCEMENT: "outline",
  UPDATE_GIFT_RECORD: "outline",
  UNSETTLE_GIFT: "outline",
};

const DETAIL_LABEL: Record<string, string> = {
  orderType: "订单类型",
  playerName: "陪玩",
  customerName: "客户",
  username: "用户名",
  displayName: "显示名",
  title: "标题",
  tier: "档位",
  quantity: "数量",
  sender: "送礼人",
  note: "备注",
  count: "数量",
};

const VALUE_MAP: Record<string, Record<string, string>> = {
  orderType: { NORMAL: "普通单", REST: "休息单" },
  fault: { PLAYER: "陪玩", CUSTOMER: "客户", SHOP: "店铺", OTHER: "其他" },
  paidMethod: { WECHAT: "微信", ALIPAY: "支付宝" },
  type: { NOTICE: "公告", ACTIVITY: "活动" },
};

const CENTS_FIELDS: Record<string, string> = { payableCents: "实付", playerEarnCents: "应得", compensationCents: "补偿", amount: "金额" };
const MINUTES_FIELDS = new Set(["durationMin", "extraMinutes"]);

function formatDetail(k: string, v: unknown): string {
  const sv = String(v);
  if (VALUE_MAP[k]) return `${DETAIL_LABEL[k] ?? k}: ${VALUE_MAP[k][sv] ?? sv}`;
  if (CENTS_FIELDS[k]) return `${CENTS_FIELDS[k]}: ${formatYuan(Number(v))}`;
  if (MINUTES_FIELDS.has(k)) return `时长: ${formatDuration(Number(v))}`;
  return `${DETAIL_LABEL[k] ?? k}: ${sv}`;
}


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
              // log.action 来自 DB,类型为 string;用作 key 时按 AuditAction 索引,
              // 配合 ?? 回退兜底未知/历史动作码,无需对结果做不安全的 as 断言。
              const action = log.action as AuditAction;
              return (
                <li key={log.id} className="flex items-start gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{log.actorName}</span>
                      <Badge variant={ACTION_COLOR[action] ?? "outline"} className="text-[10px]">
                        {ACTION_LABEL[action] ?? log.action}
                      </Badge>
                      {log.targetId && (
                        <span className="text-muted-foreground font-mono text-[10px]">{log.targetId.slice(0, 8)}…</span>
                      )}
                    </div>
                    {Object.keys(detail).length > 0 && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {Object.entries(detail).map(([k, v]) => formatDetail(k, v)).join(" · ")}
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
