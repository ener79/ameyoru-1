/**
 * 集卡大富翁(LOL 五黑集卡)。服务端定结果:掷骰消耗 1 颗骰子后,在一个事务内
 * 原子结算落点(发券/集卡/移动),并持久化新位置与卡片增量。move 量不下发,
 * 前端只拿到 {idx,name,type} 用于棋盘渲染与停子动画。集齐五黑可一键兑换 8 折券。
 */
import { eq, sql, and } from "drizzle-orm";
import { db } from "@/db";
import { customer } from "@/db/schema";
import { getAffectedRows } from "@/lib/db-utils";
import {
  MONOPOLY_BOARD,
  MONOPOLY_CARD_KEYS,
  MONOPOLY_CARD_LABEL,
} from "@/lib/constants";
import { grantCoupon, spendAsset } from "./mp-assets";

const BOARD_SIZE = MONOPOLY_BOARD.length;

/** 五种卡片计数(集卡进度)。 */
type CardCounts = Record<(typeof MONOPOLY_CARD_KEYS)[number], number>;

/** 把 customer 行的 5 个卡片列读成统一的 {top,jungle,mid,adc,support} 形状。 */
function readCards(row: {
  cardTop: number;
  cardJungle: number;
  cardMid: number;
  cardAdc: number;
  cardSupport: number;
}): CardCounts {
  return {
    top: row.cardTop,
    jungle: row.cardJungle,
    mid: row.cardMid,
    adc: row.cardAdc,
    support: row.cardSupport,
  };
}

/** 大富翁视图:骰子数 + 当前位置 + 集卡进度 + 棋盘(不含 move 量)。 */
export async function getMonopolyView(customerId: string) {
  const [row] = await db
    .select({
      diceCount: customer.diceCount,
      monopolyPos: customer.monopolyPos,
      cardTop: customer.cardTop,
      cardJungle: customer.cardJungle,
      cardMid: customer.cardMid,
      cardAdc: customer.cardAdc,
      cardSupport: customer.cardSupport,
    })
    .from(customer)
    .where(eq(customer.id, customerId))
    .limit(1);

  return {
    diceCount: row?.diceCount ?? 0,
    pos: row?.monopolyPos ?? 0,
    cards: row
      ? readCards(row)
      : { top: 0, jungle: 0, mid: 0, adc: 0, support: 0 },
    board: MONOPOLY_BOARD.map((c) => ({ idx: c.idx, name: c.name, type: c.type })),
  };
}

/** 落点奖励的对外形状(镜像前端 mock rollDice 的 reward)。 */
type Reward = {
  type: (typeof MONOPOLY_BOARD)[number]["type"];
  name: string;
  couponName?: string;
  card?: string;
  cardLabel?: string;
  move?: number;
  bonusCouponName?: string;
  bonusCard?: string;
  bonusCardLabel?: string;
  bonusName?: string;
};

/**
 * 结算一个 COUPON/CARD 落点:发券或累加卡片增量(random 随机取一种真实卡片)。
 * 返回该格对应的卡片 key(用于 reward 的 card 字段);非 CARD 返回 null。
 * tx 必须由调用方的事务提供;inc 累加到调用方维护的增量表。
 */
async function settleCouponOrCard(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  customerId: string,
  cell: (typeof MONOPOLY_BOARD)[number],
  inc: CardCounts,
  source: "MONOPOLY"
): Promise<string | null> {
  if (cell.type === "COUPON") {
    await grantCoupon(tx, customerId, {
      name: cell.couponName,
      discountLabel: cell.discountLabel,
      source,
    });
    return null;
  }
  if (cell.type === "CARD") {
    const key =
      cell.card === "random"
        ? MONOPOLY_CARD_KEYS[Math.floor(Math.random() * MONOPOLY_CARD_KEYS.length)]
        : cell.card;
    inc[key] += 1;
    return key;
  }
  return null;
}

/** 掷一次骰子:消耗 1 颗骰子,服务端结算落点,持久化新位置与卡片增量。 */
export async function performRoll(customerId: string) {
  try {
    return await db.transaction(async (tx) => {
      const ok = await spendAsset(tx, customerId, "DICE", 1, "MONOPOLY_ROLL");
      if (!ok) throw new Error("NO_DICE");

      const [row] = await tx
        .select({
          diceCount: customer.diceCount,
          monopolyPos: customer.monopolyPos,
          cardTop: customer.cardTop,
          cardJungle: customer.cardJungle,
          cardMid: customer.cardMid,
          cardAdc: customer.cardAdc,
          cardSupport: customer.cardSupport,
        })
        .from(customer)
        .where(eq(customer.id, customerId))
        .limit(1);
      if (!row) throw new Error("NO_DICE");

      const from = row.monopolyPos;
      const step = 1 + Math.floor(Math.random() * 6);
      const landed = (from + step) % BOARD_SIZE;
      const landedCell = MONOPOLY_BOARD[landed];

      // 卡片增量(本次掷骰累加,事务结束前一次性写回)。
      const inc: CardCounts = { top: 0, jungle: 0, mid: 0, adc: 0, support: 0 };

      const reward: Reward = { type: landedCell.type, name: landedCell.name };
      let bonusTo: number | undefined;

      if (landedCell.type === "COUPON") {
        reward.couponName = landedCell.couponName;
        await settleCouponOrCard(tx, customerId, landedCell, inc, "MONOPOLY");
      } else if (landedCell.type === "CARD") {
        const key = await settleCouponOrCard(tx, customerId, landedCell, inc, "MONOPOLY");
        if (key) {
          reward.card = key;
          reward.cardLabel = MONOPOLY_CARD_LABEL[key];
        }
      } else if (landedCell.type === "MOVE") {
        reward.move = landedCell.move;
        bonusTo = (landed + landedCell.move + BOARD_SIZE) % BOARD_SIZE;
        const bonusCell = MONOPOLY_BOARD[bonusTo];
        // 移动后只结算 COUPON/CARD 加成(与 mock 一致),NONE/START/MOVE 不再触发。
        if (bonusCell.type === "COUPON") {
          reward.bonusName = bonusCell.name;
          reward.bonusCouponName = bonusCell.couponName;
          await settleCouponOrCard(tx, customerId, bonusCell, inc, "MONOPOLY");
        } else if (bonusCell.type === "CARD") {
          reward.bonusName = bonusCell.name;
          const bonusKey = await settleCouponOrCard(tx, customerId, bonusCell, inc, "MONOPOLY");
          if (bonusKey) {
            reward.bonusCard = bonusKey;
            reward.bonusCardLabel = MONOPOLY_CARD_LABEL[bonusKey];
          }
        }
      }

      const to = bonusTo ?? landed;

      // 持久化:新位置 + 卡片增量。卡片列动态,显式逐 key 构造 set(不用动态 .set key)。
      const setObj: Record<string, unknown> = { monopolyPos: to };
      if (inc.top > 0) setObj.cardTop = sql`${customer.cardTop} + ${inc.top}`;
      if (inc.jungle > 0) setObj.cardJungle = sql`${customer.cardJungle} + ${inc.jungle}`;
      if (inc.mid > 0) setObj.cardMid = sql`${customer.cardMid} + ${inc.mid}`;
      if (inc.adc > 0) setObj.cardAdc = sql`${customer.cardAdc} + ${inc.adc}`;
      if (inc.support > 0) setObj.cardSupport = sql`${customer.cardSupport} + ${inc.support}`;
      await tx.update(customer).set(setObj).where(eq(customer.id, customerId));

      // 返回最新骰子/集卡(在 JS 里基于读回的行 + 本次增量计算)。
      const cards: CardCounts = {
        top: row.cardTop + inc.top,
        jungle: row.cardJungle + inc.jungle,
        mid: row.cardMid + inc.mid,
        adc: row.cardAdc + inc.adc,
        support: row.cardSupport + inc.support,
      };

      return {
        ok: true as const,
        step,
        move: { from, to: landed, bonusTo },
        reward,
        cards,
        diceCount: row.diceCount,
      };
    });
  } catch (e) {
    if (e instanceof Error && e.message === "NO_DICE") {
      return { ok: false as const, msg: "骰子不足,签到可获得骰子" };
    }
    throw e;
  }
}

/** 一键兑换:集齐五黑(5 种卡各 >= 1)各扣 1,发放下单 8 折券。 */
export async function performExchangeCards(customerId: string) {
  return await db.transaction(async (tx) => {
    // 原子守卫:仅当 5 列全部 >= 1 才整体各 -1,防并发重复兑换。
    const result = await tx
      .update(customer)
      .set({
        cardTop: sql`${customer.cardTop} - 1`,
        cardJungle: sql`${customer.cardJungle} - 1`,
        cardMid: sql`${customer.cardMid} - 1`,
        cardAdc: sql`${customer.cardAdc} - 1`,
        cardSupport: sql`${customer.cardSupport} - 1`,
      })
      .where(
        and(
          eq(customer.id, customerId),
          sql`${customer.cardTop} >= 1`,
          sql`${customer.cardJungle} >= 1`,
          sql`${customer.cardMid} >= 1`,
          sql`${customer.cardAdc} >= 1`,
          sql`${customer.cardSupport} >= 1`
        )
      );
    if (getAffectedRows(result) !== 1) {
      return { ok: false as const, msg: "尚未集齐五黑,继续掷骰收集" };
    }

    await grantCoupon(tx, customerId, {
      name: "五黑集卡 · 下单8折券",
      discountLabel: "8折",
      source: "CARD_EXCHANGE",
    });

    const [row] = await tx
      .select({
        cardTop: customer.cardTop,
        cardJungle: customer.cardJungle,
        cardMid: customer.cardMid,
        cardAdc: customer.cardAdc,
        cardSupport: customer.cardSupport,
      })
      .from(customer)
      .where(eq(customer.id, customerId))
      .limit(1);

    return {
      ok: true as const,
      cards: row
        ? readCards(row)
        : { top: 0, jungle: 0, mid: 0, adc: 0, support: 0 },
    };
  });
}
