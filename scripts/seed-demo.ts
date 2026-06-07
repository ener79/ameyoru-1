/**
 * 造测试数据：500 陪玩 + 100 客户 + 1000 订单（90% 已结算）
 * 用法：DATABASE_URL=... npx tsx scripts/seed-demo.ts
 */
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { user, account, customer, order } from "../src/db/schema";
import { INTERNAL_EMAIL_DOMAIN, DEFAULT_COMMISSION_PER_HOUR_CENTS } from "../src/lib/constants";

function nanoid(size = 16): string {
  const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < size; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

function memberNo(): string {
  return String(1000000 + Math.floor(Math.random() * 9000000));
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

const SURNAMES = "赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜戚谢邹喻柏水窦章云苏潘葛奚范彭郎鲁韦昌马苗凤花方俞任袁柳酆鲍史唐费廉岑薛雷贺倪汤滕殷罗毕郝邬安常乐于时傅皮卞齐康伍余元卜顾孟平黄和穆萧尹".split("");
const GIVEN_F = "芳丽娟敏静秀娜琳婷慧莹倩琪雪璐欣玲瑶蕾颖佳怡萍梅雅彤薇晶茜".split("");
const GIVEN_M = "伟强磊军勇杰涛斌鹏辉鑫波浩亮宏刚超龙健俊峰毅飞明华栋达".split("");
const CUSTOMER_NAMES = "老王大哥李总张姐赵老板钱总周哥吴总郑哥陈姐孙总马总林哥何总曹哥刘总高总罗总梁哥黄老板丁哥".split(/(?<=.)(?=.)/);

const GENDERS: ("MALE" | "FEMALE")[] = ["MALE", "FEMALE"];
const RATES_MALE = [3500, 4000, 4500, 5000];
const RATES_FEMALE = [4000, 4500, 5000, 5500, 6000];
const DURATIONS_MIN = [60, 90, 120, 150, 180, 210, 240, 300, 360, 420, 480, 540, 600, 660, 720];
const PAID_METHODS: ("WECHAT" | "ALIPAY")[] = ["WECHAT", "ALIPAY"];

const FAKE_PWD_HASH = "$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXY.Za";

const PLAYER_COUNT = 500;
const CUSTOMER_COUNT = 100;
const ORDER_COUNT = 1000;
const SETTLE_RATE = 0.9;

async function main() {
  const [existingBoss] = await db.select({ id: user.id }).from(user).where(eq(user.role, "BOSS")).limit(1);
  const bossId = existingBoss?.id;
  if (!bossId) {
    console.error("请先运行 npm run db:seed 创建 boss 账号");
    process.exit(1);
  }

  console.log(`[demo] 创建 ${PLAYER_COUNT} 个陪玩...`);
  const playerIds: string[] = [];
  const playerBatch: (typeof user.$inferInsert)[] = [];
  const accountBatch: (typeof account.$inferInsert)[] = [];

  for (let i = 0; i < PLAYER_COUNT; i++) {
    const id = nanoid();
    const gender = pick(GENDERS);
    const surname = pick(SURNAMES);
    const given = gender === "FEMALE" ? pick(GIVEN_F) : pick(GIVEN_M);
    const displayName = surname + given;
    const uname = `player${String(i + 1).padStart(3, "0")}`;
    const rate = gender === "MALE" ? pick(RATES_MALE) : pick(RATES_FEMALE);

    playerIds.push(id);
    playerBatch.push({
      id,
      name: displayName,
      email: `${uname}@${INTERNAL_EMAIL_DOMAIN}`,
      emailVerified: true,
      username: uname,
      displayUsername: uname,
      role: "PLAYER",
      active: true,
      playerGender: gender,
      defaultRateCents: rate,
      mustChangePwd: false,
    });
    accountBatch.push({
      id: nanoid(),
      accountId: id,
      providerId: "credential",
      userId: id,
      password: FAKE_PWD_HASH,
    });
  }

  const BATCH = 100;
  for (let i = 0; i < playerBatch.length; i += BATCH) {
    await db.insert(user).values(playerBatch.slice(i, i + BATCH));
    await db.insert(account).values(accountBatch.slice(i, i + BATCH));
  }
  console.log(`[demo] ✓ 陪玩创建完成`);

  console.log(`[demo] 创建 ${CUSTOMER_COUNT} 个客户...`);
  const customerIds: string[] = [];
  const customerBatch: (typeof customer.$inferInsert)[] = [];
  const usedNames = new Set<string>();

  for (let i = 0; i < CUSTOMER_COUNT; i++) {
    const id = nanoid();
    let name: string;
    do {
      name = pick(CUSTOMER_NAMES) + pick(CUSTOMER_NAMES) + (usedNames.size > 20 ? String(randInt(1, 99)) : "");
    } while (usedNames.has(name));
    usedNames.add(name);

    customerIds.push(id);
    customerBatch.push({
      id,
      memberNo: memberNo(),
      name,
      wechat: `wx_${name}`,
      balanceCents: Math.random() < 0.3 ? randInt(5000, 50000) : 0,
    });
  }
  await db.insert(customer).values(customerBatch);
  console.log(`[demo] ✓ 客户创建完成`);

  console.log(`[demo] 创建 ${ORDER_COUNT} 个订单 (${SETTLE_RATE * 100}% 已结算)...`);
  const now = new Date();
  const orderBatch: (typeof order.$inferInsert)[] = [];

  for (let i = 0; i < ORDER_COUNT; i++) {
    const id = nanoid();
    const pid = pick(playerIds);
    const cid = pick(customerIds);
    const pRow = playerBatch.find((p) => p.id === pid)!;
    const rateCents = pRow.defaultRateCents ?? 4000;
    const durationMin = pick(DURATIONS_MIN);

    // 随机开始时间：过去 30 天内
    const daysAgo = Math.random() * 30;
    const startHour = randInt(10, 23);
    const startDate = new Date(now.getTime() - daysAgo * 86400000);
    startDate.setHours(startHour, randInt(0, 59), 0, 0);
    const endDate = new Date(startDate.getTime() + durationMin * 60000);

    const originalCents = Math.round((rateCents * durationMin) / 60);
    const hasDiscount = Math.random() < 0.15;
    const discountCents = hasDiscount ? randInt(500, 3000) : 0;
    const payableCents = Math.max(0, originalCents - discountCents);
    const commissionCents = Math.round((DEFAULT_COMMISSION_PER_HOUR_CENTS * durationMin) / 60);
    const playerEarnCents = originalCents - commissionCents;

    const isSettled = Math.random() < SETTLE_RATE;
    const completedAt = new Date(endDate.getTime() + randInt(0, 600) * 1000);
    const settledAt = isSettled ? new Date(completedAt.getTime() + randInt(3600, 86400) * 1000) : null;

    orderBatch.push({
      id,
      dispatcherId: bossId,
      playerId: pid,
      customerId: cid,
      startAt: startDate,
      endAt: endDate,
      durationMin,
      hourlyRateCents: rateCents,
      commissionPerHourCents: DEFAULT_COMMISSION_PER_HOUR_CENTS,
      originalCents,
      discountCents,
      payableCents,
      prepayUsedCents: 0,
      commissionCents,
      playerEarnCents,
      orderStatus: "COMPLETED",
      completedAt,
      settleStatus: isSettled ? "SETTLED" : "UNSETTLED",
      settledAt,
      paidMethod: isSettled ? pick(PAID_METHODS) : null,
    });
  }

  for (let i = 0; i < orderBatch.length; i += BATCH) {
    await db.insert(order).values(orderBatch.slice(i, i + BATCH));
  }

  const settled = orderBatch.filter((o) => o.settleStatus === "SETTLED").length;
  console.log(`[demo] ✓ 订单创建完成 (${settled} 已结算, ${ORDER_COUNT - settled} 未结算)`);
  console.log(`[demo] 完成！`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => process.exit(0));
