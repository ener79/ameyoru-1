import type { PlayerGender } from "@/db/schema";

/**
 * 全店统一的抽成时薪(分/小时)。
 * 5 元/小时 = 500 分/小时。
 * 报单时会把这个值快照写入 Order.commissionPerHourCents,
 * 这样以后改全店设置时不会回溯影响历史订单。
 */
export const DEFAULT_COMMISSION_PER_HOUR_CENTS = 500;

/** 陪玩默认单价(分/小时),老板创建陪玩时若不填使用。 */
export const DEFAULT_PLAYER_RATE_CENTS = 4000;

/**
 * 单笔金额上限(分)。所有用户可填的金额(充值/扣减/单价/优惠/补偿)入口都用它兜底。
 * MySQL int 上限约 21.47 亿分(2147 万元),这里取 1 亿分(100 万元)留足安全余量,
 * 防止大额输入导致 int 列溢出、金额错乱。
 */
export const MAX_AMOUNT_CENTS = 100_000_000;

/** 分类下的可选单价档位(分/小时),用于陪玩分组、派单选人、邀请链接和新建对话框。 */
export const PRICE_BUCKETS_CENTS: Record<PlayerGender, number[]> = {
  MALE: [3500, 4000, 4500, 5000, 5500],
  FEMALE: [4000, 4500, 5000, 5500, 6000],
};

/** 全部档位并集去重排序,用于"未分类"陪玩分组的兜底展示。 */
export const ALL_PRICE_BUCKETS_CENTS = Array.from(
  new Set([...PRICE_BUCKETS_CENTS.MALE, ...PRICE_BUCKETS_CENTS.FEMALE]),
).sort((a, b) => a - b);

/** 内部"伪邮箱"域名,因为 Better Auth 要求 email 但我们用 username 登录 */
export const INTERNAL_EMAIL_DOMAIN = "mo.local";

/** 老板账号的默认用户名(seed 创建) */
export const BOSS_USERNAME = "boss";

/**
 * 礼物打赏抽成比例(basis points,万分之),默认 15% = 1500/10000。
 * 每条礼物记录会快照写入 GiftRecord.feeRateBp,
 * 这样以后改全店设置时不会回溯影响历史记录。
 */
export const DEFAULT_GIFT_FEE_RATE_BP = 1500;

export const REVERSIBLE_TXN_TYPES = [
  "DEPOSIT",
  "MANUAL_DEDUCT",
  "SERVICE_DEDUCT",
] as const;

export const GAME_SERVERS = [
  "艾欧尼亚",
  "祖安",
  "诺克萨斯",
  "班德尔城",
  "皮尔特沃夫",
  "战争学院",
  "巨神峰",
  "雷瑟守备",
  "裁决之地",
  "黑色玫瑰",
  "暗影岛",
  "钢铁烈阳",
  "水晶之痕",
  "均衡教派",
  "影流",
  "守望之海",
  "征服之海",
  "卡拉曼达",
  "皮城警备",
  "比尔吉沃特",
  "德玛西亚",
  "弗雷尔卓德",
  "无畏先锋",
  "恕瑞玛",
  "扭曲丛林",
  "巨龙之巢",
  "男爵领域",
] as const;

export type GameServer = (typeof GAME_SERVERS)[number];

/** 营销券统一门槛与有效期(活动券,固定到期日)。 */
export const MP_COUPON_THRESHOLD = "下单可用·可叠加预存";
export const MP_COUPON_EXPIRES_AT = new Date("2026-07-31T23:59:59+08:00");

/** 签到 7 天奖励周期。COUPON 项带 couponName/discountLabel,供后端发券。 */
export const CHECKIN_REWARDS = [
  { day: 1, type: "DICE", amount: 3, label: "骰子×3" },
  { day: 2, type: "DICE", amount: 5, label: "骰子×5" },
  { day: 3, type: "DRAW", amount: 1, label: "抽券×1" },
  { day: 4, type: "DICE", amount: 5, label: "骰子×5" },
  { day: 5, type: "DRAW", amount: 2, label: "抽券×2" },
  { day: 6, type: "DICE", amount: 8, label: "骰子×8" },
  {
    day: 7,
    type: "COUPON",
    amount: 1,
    label: "92折券",
    couponName: "签到7日 · 下单92折券",
    discountLabel: "92折",
  },
] as const;

