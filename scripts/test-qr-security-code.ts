import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readImageUpload } from "../src/lib/image-upload";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

const schema = read("src/db/schema.ts");
const auth = read("src/lib/auth.ts");
const imageUpload = read("src/lib/image-upload.ts");
const uploadRoute = read("src/app/api/uploads/[...path]/route.ts");
const qrAction = read("src/server/actions/qr.ts");
const usersAction = read("src/server/actions/users.ts");
const inviteForm = read("src/app/player-invite/[token]/player-invite-form.tsx");
const profilePage = read("src/app/(authed)/profile/page.tsx");
const qrSecurityCodeForm = read("src/app/(authed)/profile/qr-security-code-form.tsx");
const qrSection = read("src/app/(authed)/profile/qr-upload-section.tsx");
const playersPage = read("src/app/(authed)/players/page.tsx");
const playersClient = read("src/app/(authed)/players/players-client.tsx");
const migratePath = "scripts/migrate-qr-security.ts";
const migrate = existsSync(join(root, migratePath)) ? read(migratePath) : "";

assert.match(schema, /qrSecurityCodeHash:\s*varchar\("qr_security_code_hash"/);
assert.match(auth, /qrSecurityCodeHash/);
assert.match(read("src/lib/qr-security.ts"), /qrSecurityCodeSchema/);

for (const mime of [
  "image/gif",
  "image/bmp",
  "image/avif",
  "image/heic",
  "image/heif",
]) {
  assert.match(imageUpload, new RegExp(`"${mime}"`));
}
assert.match(imageUpload, /GIF89a|GIF87a/);
assert.match(imageUpload, /0x42/);
assert.match(imageUpload, /avif/);
assert.match(imageUpload, /heic/);
assert.match(uploadRoute, /contentTypeForImageExt/);

assert.match(usersAction, /qrSecurityCodeSchema/);
assert.match(usersAction, /qrSecurityCodeHash/);
assert.match(usersAction, /qrSecurityCodeHash\s*\?\?\s*passwordHash/);
assert.match(usersAction, /ctx\.password\.hash\(\s*parsed\.data\.qrSecurityCode\s*\)/);
assert.match(usersAction, /安全码不能和登录密码一样/);
assert.match(usersAction, /resetPlayerQrSecurityCodeAction/);
assert.match(usersAction, /target\.role !== "PLAYER"/);
assert.match(inviteForm, /securityCode/);
assert.match(inviteForm, /confirmSecurityCode/);
assert.match(inviteForm, /qrSecurityCode/);

assert.match(qrAction, /requireQrSecurityCodeReady/);
assert.match(qrAction, /请先在我的资料上方设置收款码安全码/);
assert.doesNotMatch(qrAction, /formData\.get\("securityCode"\)/);
assert.match(qrAction, /qrSecurityCodeHash/);
assert.doesNotMatch(qrAction, /password:\s*parsed\.data/);
assert.doesNotMatch(qrSection, /useState\(""\)/);
assert.doesNotMatch(qrSection, /fd\.set\("securityCode"/);
assert.doesNotMatch(qrSection, /<Input/);
assert.match(qrSection, /未设置安全码/);
assert.match(qrSection, /#qr-security-code/);
assert.match(qrSection, /请先在上方设置好安全码/);
assert.match(profilePage, /安全码/);
assert.match(profilePage, /QrSecurityCodeForm/);
assert.match(profilePage, /id="qr-security-code"/);
assert.match(qrSecurityCodeForm, /changeOwnQrSecurityCodeAction/);
assert.match(qrSecurityCodeForm, /修改收款码安全码/);
assert.match(read("src/server/actions/me.ts"), /changeOwnQrSecurityCodeAction/);
assert.match(playersPage, /qrSecurityCodeHash:\s*user\.qrSecurityCodeHash/);
assert.match(playersClient, /重置收款码安全码/);
assert.match(playersClient, /hasQrSecurityCode/);

if (migrate) {
  assert.match(migrate, /qr_security_code_hash/);
}

const pngBytes = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const oddMimePng = new File([pngBytes], "qr.unknown", {
  type: "application/octet-stream",
});
const picked = await readImageUpload(oddMimePng, {
  maxBytes: 20 * 1024 * 1024,
  label: "图片",
});
assert.deepEqual(picked.ok ? picked.upload.ext : picked.error, "png");

console.log("qr security code checks passed");
