import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

const authHelpers = read("src/lib/auth-helpers.ts");
const auth = read("src/lib/auth.ts");
const usersAction = read("src/server/actions/users.ts");
const ordersAction = read("src/server/actions/orders.ts");
const ordersList = read("src/app/(authed)/orders/orders-list.tsx");
const qrAction = read("src/server/actions/qr.ts");
const imageUpload = read("src/lib/image-upload.ts");
const uploadRoute = read("src/app/api/uploads/[...path]/route.ts");
const middleware = read("src/middleware.ts");
const playersClient = read("src/app/(authed)/players/players-client.tsx");
const staffClient = read("src/app/(authed)/staff/staff-client.tsx");
const customersList = read("src/app/(authed)/customers/customers-list.tsx");
const meAction = read("src/server/actions/me.ts");
const changePasswordForm = read("src/app/change-password/change-password-form.tsx");
const authRoute = read("src/app/api/auth/[...all]/route.ts");

assert.match(authHelpers, /active:\s*boolean/);
assert.match(authHelpers, /getFreshUser\(/);
assert.match(authHelpers, /if\s*\(!freshUser\?\.active\)/);
assert.match(authHelpers, /\/login\?inactive=1/);
assert.match(middleware, /forceLogin/);
assert.match(middleware, /searchParams\.has\("inactive"\)/);

assert.match(auth, /disableSignUp:\s*true/);
assert.match(authRoute, /sign-up\/email/);

assert.match(usersAction, /const\s+\{\s*user:\s*me\s*\}\s*=\s*await requireSession/);
assert.match(usersAction, /input\.id === me\.id/);
assert.match(usersAction, /target\.role === "BOSS"/);
assert.match(usersAction, /internalAdapter\.createUser/);
assert.match(usersAction, /internalAdapter\.createAccount/);
assert.match(usersAction, /useCount:\s*sql`/);
assert.match(usersAction, /\$\{playerInvite\.useCount\}\s*<\s*\$\{playerInvite\.maxUses\}/);
assert.match(usersAction, /db\.delete\(user\)\.where\(eq\(user\.id,\s*createdUser\.id\)\)/);

assert.match(meAction, /changeOwnPasswordAction/);
assert.match(meAction, /auth\.api\.changePassword/);
assert.match(meAction, /mustChangePwd: false/);
assert.match(changePasswordForm, /changeOwnPasswordAction/);
assert.match(changePasswordForm, /toast\.success\("密码已更新"\)/);

assert.match(ordersAction, /selectedPlayer/);
assert.match(ordersAction, /eq\(user\.role,\s*"PLAYER"\)/);
assert.match(ordersAction, /eq\(user\.active,\s*true\)/);
assert.match(ordersAction, /cancelOrderAction[\s\S]*requireSession\(\{ role: \["BOSS", "STAFF", "SERVICE"\] \}\)/);
assert.match(ordersAction, /adjustOrderRateAction[\s\S]*requireSession\(\{ role: \["BOSS", "STAFF", "SERVICE"\] \}\)/);
assert.match(ordersAction, /prepayUsedCents > 0[\s\S]*使用预存抵扣的订单不能修改单价/);
assert.match(ordersList, /const canCancel = canManage \|\| role === "SERVICE"/);
assert.match(ordersList, /const canAdjustRate = \(canManage \|\| role === "SERVICE"\)/);
assert.match(ordersList, /AdjustRateDialog/);

assert.match(imageUpload, /detectImageUpload/);
assert.match(imageUpload, /0xff/);
assert.match(imageUpload, /RIFF/);
assert.match(imageUpload, /WEBP/);
assert.match(uploadRoute, /X-Content-Type-Options/);
assert.match(uploadRoute, /Unauthorized/);
assert.match(qrAction, /readImageUpload/);
assert.match(usersAction, /readImageUpload/);

assert.match(playersClient, /if\s*\(!res\.ok\)/);
assert.match(staffClient, /if\s*\(!res\.ok\)/);
assert.match(customersList, /预存变动/);

console.log("security hardening checks passed");
