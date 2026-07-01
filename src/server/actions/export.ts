"use server";

import { and, desc, eq, gte, lte, like, or, aliasedTable } from "drizzle-orm";
import { db } from "@/db";
import { order, user, customer } from "@/db/schema";
import { requireSession } from "@/lib/auth-helpers";
import { centsToYuanString, formatDateTime, formatDuration } from "@/lib/format";

function escapeLike(s: string) {
  return s.replace(/[%_\\]/g, "\\$&");
}

function toCSV(headers: string[], rows: string[][]): string {
  const neutralizeFormula = (v: string) =>
    /^[=+\-@]/.test(v) ? `'${v}` : v;
  const escape = (v: string) =>
    `"${neutralizeFormula(v).replace(/"/g, '""')}"`;
  return [headers, ...rows].map((r) => r.map(escape).join(",")).join("\n");
}

export async function exportOrdersCSV(opts: {
  q?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  const { user: _me } = await requireSession({ role: ["BOSS", "STAFF"] });

  const dispatcherUser = aliasedTable(user, "dispatcher");
  const conditions: ReturnType<typeof eq>[] = [];

  if (opts.q) {
    conditions.push(
      or(
        like(customer.name, `%${escapeLike(opts.q)}%`),
        like(user.name, `%${escapeLike(opts.q)}%`),
        like(customer.memberNo, `%${escapeLike(opts.q)}%`)
      ) as ReturnType<typeof eq>
    );
  }
  if (opts.status === "IN_PROGRESS") conditions.push(eq(order.orderStatus, "IN_PROGRESS"));
  if (opts.status === "COMPLETED") conditions.push(eq(order.orderStatus, "COMPLETED"));
  if (opts.status === "CANCELED") conditions.push(eq(order.orderStatus, "CANCELED"));
  if (opts.status === "UNSETTLED") conditions.push(eq(order.settleStatus, "UNSETTLED"));
  if (opts.dateFrom) conditions.push(gte(order.startAt, new Date(opts.dateFrom)));
  if (opts.dateTo) conditions.push(lte(order.startAt, new Date(opts.dateTo + "T23:59:59")));

  const rows = await db
    .select({
      id: order.id,
      orderType: order.orderType,
      playerName: user.name,
      dispatcherName: dispatcherUser.name,
      customerName: customer.name,
      customerMemberNo: customer.memberNo,
      startAt: order.startAt,
      durationMin: order.durationMin,
      hourlyRateCents: order.hourlyRateCents,
      originalCents: order.originalCents,
      discountCents: order.discountCents,
      payableCents: order.payableCents,
      commissionCents: order.commissionCents,
      playerEarnCents: order.playerEarnCents,
      orderStatus: order.orderStatus,
      settleStatus: order.settleStatus,
      paidMethod: order.paidMethod,
      cancelFault: order.cancelFault,
      note: order.note,
    })
    .from(order)
    .innerJoin(user, eq(user.id, order.playerId))
    .innerJoin(dispatcherUser, eq(dispatcherUser.id, order.dispatcherId))
    .innerJoin(customer, eq(customer.id, order.customerId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(order.startAt))
    .limit(5000);

  const headers = ["订单ID", "订单类型", "陪玩", "派单人", "客户", "会员号", "开始时间", "时长", "单价(元)", "原价(元)", "优惠(元)", "实付(元)", "抽成(元)", "陪玩应得(元)", "订单状态", "结算状态", "支付方式", "备注"];

  const statusLabel: Record<string, string> = { IN_PROGRESS: "进行中", COMPLETED: "已完成", CANCELED: "已取消" };
  const settleLabel: Record<string, string> = { UNSETTLED: "未结算", SETTLED: "已结算" };
  const payLabel: Record<string, string> = { WECHAT: "微信", ALIPAY: "支付宝" };
  const typeLabel: Record<string, string> = { NORMAL: "普通", REST: "休息" };

  const csvRows = rows.map((r) => [
    r.id,
    typeLabel[r.orderType] ?? r.orderType,
    r.playerName,
    r.dispatcherName,
    r.customerName,
    r.customerMemberNo,
    formatDateTime(r.startAt),
    formatDuration(r.durationMin),
    centsToYuanString(r.hourlyRateCents),
    centsToYuanString(r.originalCents),
    centsToYuanString(r.discountCents),
    centsToYuanString(r.payableCents),
    centsToYuanString(r.commissionCents),
    centsToYuanString(r.playerEarnCents),
    statusLabel[r.orderStatus] ?? r.orderStatus,
    settleLabel[r.settleStatus] ?? r.settleStatus,
    r.paidMethod ? (payLabel[r.paidMethod] ?? r.paidMethod) : "",
    r.note ?? "",
  ]);

  return { ok: true as const, csv: toCSV(headers, csvRows), filename: `订单导出_${new Date().toLocaleDateString("zh-CN").replace(/\//g, "-")}.csv` };
}

export async function exportPlayersCSV() {
  await requireSession({ role: ["BOSS", "STAFF"] });

  const rows = await db
    .select({
      id: user.id,
      username: user.username,
      name: user.name,
      playerGender: user.playerGender,
      active: user.active,
      defaultRateCents: user.defaultRateCents,
      createdAt: user.createdAt,
    })
    .from(user)
    .where(eq(user.role, "PLAYER"))
    .orderBy(desc(user.createdAt));

  const headers = ["用户名", "姓名", "性别", "状态", "默认单价(元)", "注册时间"];
  const csvRows = rows.map((r) => [
    r.username ?? "",
    r.name,
    r.playerGender === "MALE" ? "男" : r.playerGender === "FEMALE" ? "女" : "",
    r.active ? "在职" : "停用",
    centsToYuanString(r.defaultRateCents),
    formatDateTime(r.createdAt),
  ]);

  return { ok: true as const, csv: toCSV(headers, csvRows), filename: `陪玩列表_${new Date().toLocaleDateString("zh-CN").replace(/\//g, "-")}.csv` };
}
