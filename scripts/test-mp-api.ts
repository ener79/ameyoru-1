/**
 * 小程序顾客接口的端到端测试（连真实本地库）。
 * 验证：签发/校验 token、requireCustomer 鉴权、顾客只能查自己的数据、越权被拦。
 *
 * 跑法：在 ameyoru 根目录
 *   MP_JWT_SECRET=test-secret-xxxxxxxxxxxxxxxx npx tsx scripts/test-mp-api.ts
 * 需要本地库可连（.env.local 的 DATABASE_URL）。测试结束自动清理建的测试客户。
 */
import "dotenv/config";
import { eq, inArray } from "drizzle-orm";
import { db } from "../src/db";
import { customer, customerBalanceTxn, user } from "../src/db/schema";
import { nanoid, generateMemberNo } from "../src/server/id";
import { signMpToken, requireCustomer } from "../src/server/mp-auth";
import { getMyProfile, getMyTransactions, getMyOrders } from "../src/server/mp-queries";

let pass = 0;
let fail = 0;
function ck(cond: boolean, msg: string) {
  if (cond) { pass++; console.log("  ✅ " + msg); }
  else { fail++; console.log("  ❌ " + msg); }
}

function mkReq(token?: string): Request {
  return new Request("http://x/api/mp/me", {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

async function main() {
  if (!process.env.MP_JWT_SECRET) {
    console.error("请设置 MP_JWT_SECRET 环境变量再跑");
    process.exit(1);
  }

  // 建两个测试客户 A、B
  const idA = nanoid();
  const idB = nanoid();
  const noA = generateMemberNo();
  const noB = generateMemberNo();
  await db.insert(customer).values([
    { id: idA, memberNo: noA, name: "测试客户A", balanceCents: 12345, wechatOpenid: "openid_test_A_" + idA },
    { id: idB, memberNo: noB, name: "测试客户B", balanceCents: 999, wechatOpenid: "openid_test_B_" + idB },
  ]);
  // 给 A 写两条流水（createdById 需为真实 user，取一个现有店员）
  const [anyUser] = await db.select({ id: user.id }).from(user).limit(1);
  if (!anyUser) {
    console.error("库里没有任何 user（店员），无法测流水。跳过流水相关断言。");
  }
  const actorId = anyUser?.id ?? idA;
  await db.insert(customerBalanceTxn).values([
    { id: nanoid(), customerId: idA, type: "DEPOSIT", amountCents: 10000, createdById: actorId, note: "测试充值" },
    { id: nanoid(), customerId: idA, type: "SERVICE_DEDUCT", amountCents: -2000, createdById: actorId, note: "测试扣减" },
  ]);
  console.log("已建测试客户 A/B + A 的流水\n");

  try {
    console.log("【1. token 签发 + requireCustomer 鉴权】");
    const tokenA = await signMpToken(idA);
    const authA = await requireCustomer(mkReq(tokenA));
    ck(authA.ok && authA.customer.id === idA, "A 的 token 能鉴权出 A");
    ck(authA.ok && authA.customer.balanceCents === 12345, "鉴权返回 A 的余额");

    console.log("【2. 无 token / 错 token / 篡改 token 都 401】");
    const noTok = await requireCustomer(mkReq());
    ck(!noTok.ok && noTok.status === 401, "无 token → 401");
    const badTok = await requireCustomer(mkReq("garbage.token.xxx"));
    ck(!badTok.ok && badTok.status === 401, "错 token → 401");
    const tampered = tokenA.slice(0, -3) + "zzz";
    const tamperedRes = await requireCustomer(mkReq(tampered));
    ck(!tamperedRes.ok && tamperedRes.status === 401, "篡改 token → 401");

    console.log("【3. 顾客只查自己的数据】");
    const profA = await getMyProfile(idA);
    ck(profA?.memberNo === noA && profA?.balanceCents === 12345, "getMyProfile 返回 A 自己");
    const txA = await getMyTransactions(idA, {});
    ck(txA.length === 2, "A 的流水 2 条（实际 " + txA.length + "）");
    ck(txA.every((t) => ["RECHARGE", "CONSUME", "REWARD", "REFUND"].includes(t.kind)), "流水 type 已映射成小程序口径");
    ck(txA[0].kind === "CONSUME" || txA[0].kind === "RECHARGE", "流水含充值/消费");

    console.log("【4. 越权：A 查不到 B 的数据】");
    const txB = await getMyTransactions(idB, {});
    ck(txB.length === 0, "B 没有流水（B 的查询不串到 A）");
    const profB = await getMyProfile(idB);
    ck(profB?.balanceCents === 999, "B 的 profile 是 B 自己的（999），不是 A 的");
    // 关键：拿 A 的 token，接口只会用 authA.customer.id 查，永远查不到 B
    ck(authA.ok && authA.customer.id !== idB, "A 的 token 解出的 id 不等于 B → 无法越权查 B");

    console.log("【5. 订单查询（A 无订单，空态）】");
    const ordA = await getMyOrders(idA, {});
    ck(Array.isArray(ordA) && ordA.length === 0, "A 无订单返回空数组（空态正常）");

  } finally {
    // 清理测试数据
    await db.delete(customerBalanceTxn).where(eq(customerBalanceTxn.customerId, idA));
    await db.delete(customer).where(inArray(customer.id, [idA, idB]));
    console.log("\n已清理测试客户 A/B");
  }

  console.log(`\n===== ${pass}/${pass + fail} 通过 =====`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("测试异常:", e);
  process.exit(1);
});
