import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const ordersAction = readFileSync(
  join(root, "src/server/actions/orders.ts"),
  "utf8"
);

function functionBlock(name: string): string {
  const start = ordersAction.indexOf(`export async function ${name}`);
  assert.notEqual(start, -1, `${name} is missing`);
  const next = ordersAction.indexOf("\nexport async function ", start + 1);
  return ordersAction.slice(start, next === -1 ? undefined : next);
}

function assertOrdered(source: string, needles: string[], label: string) {
  let cursor = -1;
  for (const needle of needles) {
    const index = source.indexOf(needle);
    assert.notEqual(index, -1, `${label}: missing ${needle}`);
    assert.ok(index > cursor, `${label}: ${needle} is out of order`);
    cursor = index;
  }
}

assert.match(
  ordersAction,
  /const CANCELABLE_ORDER_STATUSES = \["IN_PROGRESS", "COMPLETED"\] as const;/
);
assert.match(ordersAction, /function settlableOrderCondition\(\)/);
assert.match(ordersAction, /eq\(order\.orderStatus, "COMPLETED"\)/);
assert.match(ordersAction, /eq\(order\.orderStatus, "CANCELED"\)/);
assert.match(ordersAction, /gt\(order\.playerCompensationCents, 0\)/);
assert.match(ordersAction, /"affectedRows" in result/);
assert.match(ordersAction, /"rowsAffected" in result/);

const cancelBlock = functionBlock("cancelOrderAction");
assert.match(cancelBlock, /eq\(order\.settleStatus, "UNSETTLED"\)/);
assert.match(cancelBlock, /inArray\(order\.orderStatus, CANCELABLE_ORDER_STATUSES\)/);
assertOrdered(
  cancelBlock,
  [
    "const result = await tx",
    "if (getAffectedRows(result) !== 1)",
    'type: "ORDER_REFUND"',
    "notifyOrderCanceled",
    'action: "CANCEL_ORDER"',
  ],
  "cancelOrderAction"
);

const settleBlock = functionBlock("settleOrderAction");
assertOrdered(
  settleBlock,
  [
    "const result = await db",
    'eq(order.settleStatus, "UNSETTLED")',
    "settlableOrderCondition()",
    "if (getAffectedRows(result) !== 1)",
    "const [target] = await db",
    "notifyOrderSettled",
    'action: "SETTLE_ORDER"',
  ],
  "settleOrderAction"
);

const unsettleBlock = functionBlock("unsettleOrderAction");
assertOrdered(
  unsettleBlock,
  [
    "const result = await db",
    'eq(order.settleStatus, "SETTLED")',
    "if (getAffectedRows(result) !== 1)",
    'action: "UNSETTLE_ORDER"',
    "invalidatePages(input.id)",
  ],
  "unsettleOrderAction"
);

const batchBlock = functionBlock("batchSettleAction");
assert.doesNotMatch(batchBlock, /\.select\(/);
assert.match(batchBlock, /const uniqueIds = Array\.from\(new Set\(input\.ids\)\)/);
assertOrdered(
  batchBlock,
  [
    "const result = await tx",
    "inArray(order.id, uniqueIds)",
    'eq(order.settleStatus, "UNSETTLED")',
    "settlableOrderCondition()",
    "settled = getAffectedRows(result)",
    "if (settled > 0)",
    'action: "BATCH_SETTLE"',
    'revalidatePath("/orders")',
  ],
  "batchSettleAction"
);

console.log("order state machine checks passed");
