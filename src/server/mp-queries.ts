/**
 * 小程序顾客视角的只读查询（顾客只能查自己的数据）。
 *
 * 与 src/server/stats.ts、src/server/actions/* 的店员视角查询区分开：
 * 这里所有查询都强制按 customerId 过滤，调用方（/api/mp/*）已用 requireCustomer 拿到
 * 当前顾客 id，绝不接受外部传入的任意 customerId。
 */
import { and, desc, eq, lt } from "drizzle-orm";
import { db } from "@/db";
import {
  customer,
  customerBalanceTxn,
  order,
  user,
  type CustomerBalanceTxnType,
} from "@/db/schema";

/** 余额流水类型 → 小程序展示类型（小程序 records 页用 RECHARGE/CONSUME/REWARD/REFUND）。 */
const TXN_KIND: Record<CustomerBalanceTxnType, "RECHARGE" | "CONSUME" | "REWARD" | "REFUND"> = {
  DEPOSIT: "RECHARGE", // 充值/预存
  ORDER_DEBIT: "CONSUME", // 下单扣费
  ORDER_REFUND: "REFUND", // 订单退款
  MANUAL_DEDUCT: "CONSUME", // 手动扣减（也算消费侧）
  SERVICE_DEDUCT: "CONSUME", // 服务扣减
  REVERSAL: "REFUND", // 冲正（金额回退）
};

const TXN_TITLE: Record<CustomerBalanceTxnType, string> = {
  DEPOSIT: "预存充值",
  ORDER_DEBIT: "陪玩消费",
  ORDER_REFUND: "订单退款",
  MANUAL_DEDUCT: "余额调整",
  SERVICE_DEDUCT: "余额扣减",
  REVERSAL: "交易冲正",
};

/** 我的余额 + 会员信息。 */
export async function getMyProfile(customerId: string) {
  const [row] = await db
    .select({
      memberNo: customer.memberNo,
      name: customer.name,
      balanceCents: customer.balanceCents,
      mpAvatarUrl: customer.mpAvatarUrl,
    })
    .from(customer)
    .where(eq(customer.id, customerId))
    .limit(1);
  return row ?? null;
}

/** 我的余额流水（按时间倒序，游标分页）。before = 上一页最后一条的 createdAt(ISO)。 */
export async function getMyTransactions(
  customerId: string,
  opts: { limit?: number; before?: string } = {}
) {
  const limit = Math.min(Math.max(opts.limit ?? 30, 1), 100);
  const conds = [eq(customerBalanceTxn.customerId, customerId)];
  if (opts.before) {
    const d = new Date(opts.before);
    if (!Number.isNaN(d.getTime())) conds.push(lt(customerBalanceTxn.createdAt, d));
  }
  const rows = await db
    .select({
      id: customerBalanceTxn.id,
      type: customerBalanceTxn.type,
      amountCents: customerBalanceTxn.amountCents,
      note: customerBalanceTxn.note,
      createdAt: customerBalanceTxn.createdAt,
    })
    .from(customerBalanceTxn)
    .where(and(...conds))
    .orderBy(desc(customerBalanceTxn.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    kind: TXN_KIND[r.type],
    title: r.note || TXN_TITLE[r.type],
    amountCents: r.amountCents,
    createdAt: r.createdAt.toISOString(),
  }));
}

/** 在役陪玩师列表（顾客展示用，不含敏感信息）。 */
export async function getActivePlayers() {
  const rows = await db
    .select({
      id: user.id,
      name: user.name,
      gender: user.playerGender,
      rateCents: user.defaultRateCents,
      avatar: user.image,
    })
    .from(user)
    .where(and(eq(user.role, "PLAYER"), eq(user.active, true)))
    .orderBy(user.name);

  return rows
    .filter((r) => r.gender != null && r.rateCents != null)
    .map((r) => ({
      id: r.id,
      name: r.name,
      gender: r.gender!,
      rateCents: r.rateCents!,
      avatar: r.avatar,
    }));
}

/** 我的订单（按开始时间倒序），带陪玩名。 */
export async function getMyOrders(customerId: string, opts: { limit?: number } = {}) {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
  const rows = await db
    .select({
      id: order.id,
      playerName: user.name,
      durationMin: order.durationMin,
      payableCents: order.payableCents,
      orderStatus: order.orderStatus,
      startAt: order.startAt,
    })
    .from(order)
    .innerJoin(user, eq(user.id, order.playerId))
    .where(eq(order.customerId, customerId))
    .orderBy(desc(order.startAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    playerName: r.playerName,
    durationMin: r.durationMin,
    payableCents: r.payableCents,
    status: r.orderStatus,
    startAt: r.startAt.toISOString(),
  }));
}
