/**
 * 小程序顾客营销资产层:骰子/抽券货币(缓存余额 + 流水台账)与卡券实例。
 *
 * 发放/消耗都在事务内完成:消耗用「WHERE 余额 >= 数量」原子守卫防超扣(并发安全),
 * 缓存余额(customer.diceCount/drawTickets)与流水(customer_asset_txn)同事务更新保证一致。
 * 调用方(签到/抽券/大富翁)各自 db.transaction 包裹,把 tx 传进来。
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  customer,
  customerAssetTxn,
  customerCoupon,
  type AssetType,
  type CouponSource,
} from "@/db/schema";
import { getAffectedRows } from "@/lib/db-utils";
import { MP_COUPON_EXPIRES_AT, MP_COUPON_THRESHOLD } from "@/lib/constants";
import { nanoid } from "./id";

/** db.transaction 回调里的事务对象类型(与 db 同接口)。 */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

type AssetReason = "CHECKIN" | "WHEEL_DRAW" | "WHEEL_REFUND" | "MONOPOLY_ROLL" | "PLAY_HOURS";

/** 发放货币:缓存余额 +amount 并写一条正流水。无需守卫。 */
export async function grantAsset(
  tx: Tx,
  customerId: string,
  assetType: AssetType,
  amount: number,
  reason: AssetReason,
  refId?: string
) {
  const setObj =
    assetType === "DICE"
      ? { diceCount: sql`${customer.diceCount} + ${amount}` }
      : { drawTickets: sql`${customer.drawTickets} + ${amount}` };
  await tx.update(customer).set(setObj).where(eq(customer.id, customerId));
  await tx.insert(customerAssetTxn).values({
    id: nanoid(),
    customerId,
    assetType,
    delta: amount,
    reason,
    refId: refId ?? null,
  });
}

/**
 * 消耗货币:仅当余额 >= amount 时缓存余额 -amount 并写一条负流水。
 * 返回 true=成功,false=余额不足(并发下第二个请求也会安全失败)。
 */
export async function spendAsset(
  tx: Tx,
  customerId: string,
  assetType: AssetType,
  amount: number,
  reason: AssetReason,
  refId?: string
): Promise<boolean> {
  const col = assetType === "DICE" ? customer.diceCount : customer.drawTickets;
  const setObj =
    assetType === "DICE"
      ? { diceCount: sql`${customer.diceCount} - ${amount}` }
      : { drawTickets: sql`${customer.drawTickets} - ${amount}` };
  const result = await tx
    .update(customer)
    .set(setObj)
    .where(and(eq(customer.id, customerId), sql`${col} >= ${amount}`));
  if (getAffectedRows(result) !== 1) return false;
  await tx.insert(customerAssetTxn).values({
    id: nanoid(),
    customerId,
    assetType,
    delta: -amount,
    reason,
    refId: refId ?? null,
  });
  return true;
}

/** 当前货币余额(骰子/抽券)。 */
export async function getAssetBalances(customerId: string) {
  const [row] = await db
    .select({ diceCount: customer.diceCount, drawTickets: customer.drawTickets })
    .from(customer)
    .where(eq(customer.id, customerId))
    .limit(1);
  return row ?? null;
}

/** 发券:写一条 UNUSED 卡券实例,门槛/有效期取统一常量。 */
export async function grantCoupon(
  tx: Tx,
  customerId: string,
  opts: { name: string; discountLabel: string; source: CouponSource }
) {
  const id = nanoid();
  await tx.insert(customerCoupon).values({
    id,
    customerId,
    name: opts.name,
    discountLabel: opts.discountLabel,
    threshold: MP_COUPON_THRESHOLD,
    source: opts.source,
    expiresAt: MP_COUPON_EXPIRES_AT,
  });
  return id;
}

/** 未使用卡券数量(会员页角标用)。 */
export async function getUnusedCouponCount(customerId: string) {
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(customerCoupon)
    .where(
      and(
        eq(customerCoupon.customerId, customerId),
        eq(customerCoupon.status, "UNUSED")
      )
    );
  return Number(row?.n ?? 0);
}

/** 我的卡券列表(按创建时间倒序)。 */
export async function getMyCoupons(customerId: string) {
  const rows = await db
    .select({
      id: customerCoupon.id,
      name: customerCoupon.name,
      discountLabel: customerCoupon.discountLabel,
      threshold: customerCoupon.threshold,
      status: customerCoupon.status,
      expiresAt: customerCoupon.expiresAt,
      createdAt: customerCoupon.createdAt,
    })
    .from(customerCoupon)
    .where(eq(customerCoupon.customerId, customerId))
    .orderBy(desc(customerCoupon.createdAt))
    .limit(100);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    discountLabel: r.discountLabel,
    threshold: r.threshold,
    status: r.status,
    expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  }));
}
