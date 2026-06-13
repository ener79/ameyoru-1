import { requireSession } from "@/lib/auth-helpers";
import { db } from "@/db";
import { auditLog } from "@/db/schema";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { Pagination } from "@/components/pagination";
import { ClipboardList } from "lucide-react";
import { formatDuration, formatRelativeDateTime, formatYuan } from "@/lib/format";
import { AuditFilterBar } from "./audit-filter-bar";

const PAGE_SIZE = 50;

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

const DETAIL_LABEL: Record<string, string> = {
  playerName: "陪玩",
  customerName: "客户",
  payableCents: "实付",
  playerEarnCents: "应得",
  amount: "金额",
  paidMethod: "方式",
  durationMin: "时长",
  fault: "责任方",
  compensationCents: "补偿",
  extraMinutes: "追加",
  oldMin: "原时长",
  newMin: "新时长",
  count: "数量",
  title: "标题",
  userName: "用户",
  username: "用户名",
  siteName: "站点",
  tier: "档位",
  quantity: "数量",
  sender: "赠送人",
};

const CENTS_KEYS = new Set(["payableCents", "playerEarnCents", "amount", "compensationCents"]);
const MIN_KEYS = new Set(["durationMin", "oldMin", "newMin", "extraMinutes"]);
const PAID_METHOD_LABEL: Record<string, string> = { WECHAT: "微信", ALIPAY: "支付宝" };
const FAULT_LABEL: Record<string, string> = { PLAYER: "陪玩", CUSTOMER: "客户", SHOP: "店铺", OTHER: "其他" };

function formatDetailValue(key: string, value: unknown): string {
  const v = String(value);
  if (CENTS_KEYS.has(key)) return formatYuan(Number(value));
  if (MIN_KEYS.has(key)) return formatDuration(Number(value));
  if (key === "paidMethod") return PAID_METHOD_LABEL[v] ?? v;
  if (key === "fault") return FAULT_LABEL[v] ?? v;
  return v;
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ actor?: string; action?: string; page?: string }>;
}) {
  await requireSession({ role: ["BOSS"] });

  const params = await searchParams;
  const actor = params.actor?.trim() ?? "";
  const action = params.action?.trim() ?? "";
  const page = Math.max(1, parseInt(params.page ?? "1") || 1);

  // 操作人下拉:按最近活跃排序,同一 actorId 取最新用过的名字去重
  const actorRows = await db
    .select({
      actorId: auditLog.actorId,
      actorName: auditLog.actorName,
    })
    .from(auditLog)
    .groupBy(auditLog.actorId, auditLog.actorName)
    .orderBy(desc(sql`MAX(${auditLog.createdAt})`));
  const seenActor = new Set<string>();
  const actorOptions: { id: string; name: string }[] = [];
  for (const r of actorRows) {
    if (seenActor.has(r.actorId)) continue;
    seenActor.add(r.actorId);
    actorOptions.push({ id: r.actorId, name: r.actorName });
  }

  // 操作类型下拉:只列日志里真实出现过的类型
  const actionRows = await db
    .selectDistinct({ action: auditLog.action })
    .from(auditLog);
  const actionOptions = actionRows
    .map((r) => ({ value: r.action, label: ACTION_LABEL[r.action] ?? r.action }))
    .sort((a, b) => a.label.localeCompare(b.label, "zh"));

  const conditions: ReturnType<typeof eq>[] = [];
  if (actor) conditions.push(eq(auditLog.actorId, actor));
  if (action) conditions.push(eq(auditLog.action, action));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [countResult] = await db
    .select({ count: count() })
    .from(auditLog)
    .where(where);
  const total = countResult?.count ?? 0;

  const logs = await db
    .select()
    .from(auditLog)
    .where(where)
    .orderBy(desc(auditLog.createdAt))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);

  const hasFilter = !!actor || !!action;
  const tableEmpty = actorOptions.length === 0;

  const baseParams = new URLSearchParams();
  if (actor) baseParams.set("actor", actor);
  if (action) baseParams.set("action", action);
  const baseQs = baseParams.toString();
  const baseHref = baseQs ? `/audit-log?${baseQs}` : "/audit-log";

  return (
    <>
      <PageHeader
        title="操作日志"
        description={
          hasFilter ? `筛选结果 · 共 ${total} 条` : `共 ${total} 条操作记录`
        }
      />
      {tableEmpty ? (
        <EmptyState icon={<ClipboardList />} title="暂无操作记录" />
      ) : (
        <>
          <AuditFilterBar
            actor={actor}
            action={action}
            actorOptions={actorOptions}
            actionOptions={actionOptions}
          />
          {logs.length === 0 ? (
            <EmptyState
              icon={<ClipboardList />}
              title="没有匹配的记录"
              description="换个操作人或操作类型试试"
            />
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
                        </div>
                        {Object.keys(detail).length > 0 && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {Object.entries(detail).map(([k, v]) => `${DETAIL_LABEL[k] ?? k}: ${formatDetailValue(k, v)}`).join(" · ")}
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
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            baseHref={baseHref}
          />
        </>
      )}
    </>
  );
}
