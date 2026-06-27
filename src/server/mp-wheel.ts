/**
 * 满4h抽券(转盘)。服务端定结果:加权随机命中后,在一个事务内原子扣 1 次抽券、
 * 按结果发券或退还(AGAIN)。权重不下发,前端只拿到 {idx,label} 用于停盘动画。
 */
import { db } from "@/db";
import { WHEEL_PRIZES } from "@/lib/constants";
import { getAssetBalances, grantAsset, grantCoupon, spendAsset } from "./mp-assets";

/** 转盘视图:奖池(不含权重)+ 当前抽券次数。 */
export async function getWheelView(customerId: string) {
  const bal = await getAssetBalances(customerId);
  return {
    drawTickets: bal?.drawTickets ?? 0,
    prizes: WHEEL_PRIZES.map((p) => ({ idx: p.idx, label: p.label })),
  };
}

/** 抽一次:消耗 1 次抽券,返回命中奖品(含扇区 idx 供前端停盘)。 */
export async function performDraw(customerId: string) {
  // 加权命中(服务端定结果)
  const total = WHEEL_PRIZES.reduce((s, p) => s + p.weight, 0);
  let r = Math.random() * total;
  let hit: (typeof WHEEL_PRIZES)[number] = WHEEL_PRIZES[0];
  for (const p of WHEEL_PRIZES) {
    if (r < p.weight) {
      hit = p;
      break;
    }
    r -= p.weight;
  }

  try {
    await db.transaction(async (tx) => {
      const ok = await spendAsset(tx, customerId, "DRAW", 1, "WHEEL_DRAW");
      if (!ok) throw new Error("NO_TICKET");
      if (hit.type === "AGAIN") {
        await grantAsset(tx, customerId, "DRAW", 1, "WHEEL_REFUND");
      } else if (hit.type === "COUPON") {
        await grantCoupon(tx, customerId, {
          name: hit.couponName,
          discountLabel: hit.discountLabel,
          source: "WHEEL",
        });
      }
    });
  } catch (e) {
    if (e instanceof Error && e.message === "NO_TICKET") {
      return {
        ok: false as const,
        msg: "抽券次数不足,签到或当日点陪玩满4小时可获得抽券机会",
      };
    }
    throw e;
  }

  return {
    ok: true as const,
    prize: { idx: hit.idx, type: hit.type, label: hit.label },
  };
}
