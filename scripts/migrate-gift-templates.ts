/**
 * 礼物模板迁移: 用旧的 6 档固定金额创建初始模板,回填 giftRecord 的 giftName / giftTemplateId。
 *
 * 前提: 先运行 `drizzle-kit push` 建好 gift_template 表和 gift_record 新列。
 * 用法: npx tsx scripts/migrate-gift-templates.ts
 */
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { giftTemplate, giftRecord } from "../src/db/schema";
import { nanoid } from "../src/server/id";

const OLD_TIERS = [
  { cents: 6800, name: "68元" },
  { cents: 12800, name: "128元" },
  { cents: 25800, name: "258元" },
  { cents: 52000, name: "520元" },
  { cents: 131400, name: "1314元" },
  { cents: 520000, name: "5200元" },
] as const;

async function main() {
  // 1. Create templates for each old tier (skip if templates already exist)
  const existing = await db.select({ id: giftTemplate.id }).from(giftTemplate).limit(1);
  if (existing.length > 0) {
    console.log("[migrate] gift_template 表已有数据,跳过模板创建");
  } else {
    for (let i = 0; i < OLD_TIERS.length; i++) {
      const tier = OLD_TIERS[i];
      const id = nanoid();
      await db.insert(giftTemplate).values({
        id,
        name: tier.name,
        priceCents: tier.cents,
        sortOrder: i,
        active: true,
      });
      console.log(`[migrate] 创建模板: ${tier.name} (${tier.cents / 100}元) → ${id}`);
    }
  }

  // 2. Build cents→template map
  const templates = await db
    .select({ id: giftTemplate.id, name: giftTemplate.name, priceCents: giftTemplate.priceCents })
    .from(giftTemplate);
  const centsMap = new Map(templates.map((t) => [t.priceCents, t]));

  // 3. Backfill giftRecord rows that lack giftName
  const records = await db
    .select({ id: giftRecord.id, giftTierCents: giftRecord.giftTierCents, giftName: giftRecord.giftName })
    .from(giftRecord);

  let updated = 0;
  for (const r of records) {
    if (r.giftName) continue;
    const template = centsMap.get(r.giftTierCents);
    if (template) {
      await db
        .update(giftRecord)
        .set({ giftName: template.name, giftTemplateId: template.id })
        .where(eq(giftRecord.id, r.id));
      updated++;
    } else {
      await db
        .update(giftRecord)
        .set({ giftName: `${r.giftTierCents / 100}元` })
        .where(eq(giftRecord.id, r.id));
      updated++;
    }
  }

  console.log(`[migrate] 回填了 ${updated} 条礼物记录`);
  console.log("[migrate] 完成");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
