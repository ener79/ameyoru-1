import { DEFAULT_COMMISSION_PER_HOUR_CENTS } from "./constants";

/** 计算两个时间之间的分钟数。若 endAt < startAt,自动按跨零点处理(+1天)。 */
function durationMinutes(startAt: Date, endAt: Date): number {
  let endMs = endAt.getTime();
  if (endMs < startAt.getTime()) {
    endMs += 24 * 60 * 60 * 1000;
  }
  return Math.round((endMs - startAt.getTime()) / 60000);
}

/** 按分钟比例换算金额 = round(每小时分 × 时长分 / 60) */
function proRate(perHourCents: number, durationMin: number): number {
  return Math.round((perHourCents * durationMin) / 60);
}

/**
 * 报单时的一站式计算。
 * - originalCents = 单价 × 时长(自动算,客户"标价")
 * - discountCents = 优惠(默认 0,管理者可填)
 * - payableCents  = 实付 = original − discount(客户实际付的)
 * - commissionCents = 抽成时薪 × 时长(店里"理论"抽这么多)
 * - playerEarnCents = original − commission(陪玩按原价拿,不受打折影响)
 * - shopProfitCents = payable − playerEarn = commission − discount(店里实际毛利,可负)
 */
export function computeOrder(input: {
  startAt: Date;
  endAt: Date;
  hourlyRateCents: number;
  discountCents?: number;
  commissionPerHourCents?: number;
}) {
  const commissionPerHour =
    input.commissionPerHourCents ?? DEFAULT_COMMISSION_PER_HOUR_CENTS;
  const discount = Math.max(0, input.discountCents ?? 0);

  const durationMin = durationMinutes(input.startAt, input.endAt);
  const original = proRate(input.hourlyRateCents, durationMin);
  const payable = Math.max(0, original - discount);
  const commission = proRate(commissionPerHour, durationMin);
  // 兜底:单价低于抽成时薪时 original < commission,陪玩应得不能为负。
  // 创建订单时已校验单价 ≥ 抽成,这里再防御历史脏数据/异常输入。
  const playerEarn = Math.max(0, original - commission);

  return {
    durationMin,
    commissionPerHourCents: commissionPerHour,
    originalCents: original,
    discountCents: discount,
    payableCents: payable,
    commissionCents: commission,
    playerEarnCents: playerEarn,
    /** 店里实际毛利(可负) */
    shopProfitCents: payable - playerEarn,
  };
}
