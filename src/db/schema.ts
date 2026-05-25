import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/* ----------------------------- Better Auth 标准表 ----------------------------- */

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  // Better Auth 要求 email 字段且 unique。我们用 username 登录,
  // 这里存放伪 email(`<username>@mo.local`)。
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" })
    .notNull()
    .default(true),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),

  // username plugin 字段
  username: text("username").unique(),
  displayUsername: text("display_username"),

  // 业务字段
  // BOSS = 店主(全权限);STAFF = 客服/店长(派单/看数据,不管员工);PLAYER = 陪玩
  role: text("role", { enum: ["BOSS", "STAFF", "PLAYER"] })
    .notNull()
    .default("PLAYER"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  playerGender: text("player_gender", { enum: ["MALE", "FEMALE"] }),
  defaultRateCents: integer("default_rate_cents"),
  mustChangePwd: integer("must_change_pwd", { mode: "boolean" })
    .notNull()
    .default(true),
  wechatQrPath: text("wechat_qr_path"),
  alipayQrPath: text("alipay_qr_path"),
  qrSecurityCodeHash: text("qr_security_code_hash"),
});

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", {
    mode: "timestamp",
  }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", {
    mode: "timestamp",
  }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .default(sql`(unixepoch())`),
});

/* ------------------------------- 业务表 ------------------------------- */

export const customer = sqliteTable(
  "customer",
  {
    id: text("id").primaryKey(),
    // 7 位数字会员号,创建时生成,unique
    memberNo: text("member_no").notNull().unique(),
    name: text("name").notNull(),
    // 客户微信(仅 BOSS/STAFF 可见,陪玩看不到)
    wechat: text("wechat"),
    note: text("note"),
    balanceCents: integer("balance_cents").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    index("customer_name_idx").on(t.name),
    index("customer_wechat_idx").on(t.wechat),
  ]
);

export const playerInvite = sqliteTable(
  "player_invite",
  {
    id: text("id").primaryKey(),
    inviteToken: text("invite_token").notNull().unique(),
    createdById: text("created_by_id")
      .notNull()
      .references(() => user.id),
    playerGender: text("player_gender", { enum: ["MALE", "FEMALE"] }),
    defaultRateCents: integer("default_rate_cents"),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
    maxUses: integer("max_uses").notNull().default(1),
    useCount: integer("use_count").notNull().default(0),
    usedAt: integer("used_at", { mode: "timestamp" }),
    usedById: text("used_by_id").references(() => user.id),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    index("player_invite_token_idx").on(t.inviteToken),
    index("player_invite_created_by_idx").on(t.createdById, t.createdAt),
  ]
);

export const order = sqliteTable(
  "order",
  {
    id: text("id").primaryKey(),
    dispatcherId: text("dispatcher_id")
      .notNull()
      .references(() => user.id),
    playerId: text("player_id")
      .notNull()
      .references(() => user.id),
    customerId: text("customer_id")
      .notNull()
      .references(() => customer.id),

    startAt: integer("start_at", { mode: "timestamp" }).notNull(),
    endAt: integer("end_at", { mode: "timestamp" }).notNull(),
    durationMin: integer("duration_min").notNull(),

    hourlyRateCents: integer("hourly_rate_cents").notNull(),
    commissionPerHourCents: integer("commission_per_hour_cents").notNull(),

    // 三段定价(单位:分)
    // - originalCents = 单价 × 时长(自动算)
    // - discountCents = 优惠金额(默认 0,管理者可设)
    // - payableCents  = 客户实付 = original - discount
    originalCents: integer("original_cents").notNull(),
    discountCents: integer("discount_cents").notNull().default(0),
    payableCents: integer("payable_cents").notNull(),
    prepayUsedCents: integer("prepay_used_cents").notNull().default(0),

    // 陪玩按"原价"结算,不受打折影响(陪玩拿足)
    commissionCents: integer("commission_cents").notNull(),
    playerEarnCents: integer("player_earn_cents").notNull(),

    orderStatus: text("order_status", {
      enum: ["IN_PROGRESS", "COMPLETED", "CANCELED"],
    })
      .notNull()
      .default("IN_PROGRESS"),
    completedAt: integer("completed_at", { mode: "timestamp" }),
    canceledAt: integer("canceled_at", { mode: "timestamp" }),

    // 取消时记录的纠纷信息(仅 CANCELED 时有意义)
    cancelFault: text("cancel_fault", {
      enum: ["PLAYER", "CUSTOMER", "SHOP", "OTHER"],
    }),
    cancelNote: text("cancel_note"),
    /** 取消单给陪玩的补偿金额。> 0 时此单仍需走结算流程 */
    playerCompensationCents: integer("player_compensation_cents")
      .notNull()
      .default(0),

    settleStatus: text("settle_status", { enum: ["UNSETTLED", "SETTLED"] })
      .notNull()
      .default("UNSETTLED"),
    settledAt: integer("settled_at", { mode: "timestamp" }),
    paidMethod: text("paid_method", { enum: ["WECHAT", "ALIPAY"] }),

    note: text("note"),

    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    index("order_player_idx").on(t.playerId, t.startAt),
    index("order_dispatcher_idx").on(t.dispatcherId),
    index("order_status_idx").on(t.orderStatus, t.settleStatus),
    index("order_customer_idx").on(t.customerId),
    index("order_start_at_idx").on(t.startAt),
  ]
);

export const customerBalanceTxn = sqliteTable(
  "customer_balance_txn",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id")
      .notNull()
      .references(() => customer.id),
    orderId: text("order_id").references(() => order.id),
    type: text("type", {
      enum: ["DEPOSIT", "ORDER_DEBIT", "ORDER_REFUND"],
    }).notNull(),
    amountCents: integer("amount_cents").notNull(),
    note: text("note"),
    createdById: text("created_by_id")
      .notNull()
      .references(() => user.id),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    index("customer_balance_txn_customer_idx").on(t.customerId, t.createdAt),
    index("customer_balance_txn_order_idx").on(t.orderId),
  ]
);

/* ------------------------------- 类型 ------------------------------- */

export type Role = "BOSS" | "STAFF" | "PLAYER";
export type PlayerGender = "MALE" | "FEMALE";
export type OrderStatus = "IN_PROGRESS" | "COMPLETED" | "CANCELED";
export type SettleStatus = "UNSETTLED" | "SETTLED";
export type PayMethod = "WECHAT" | "ALIPAY";
export type CancelFault = "PLAYER" | "CUSTOMER" | "SHOP" | "OTHER";
export type CustomerBalanceTxnType =
  | "DEPOSIT"
  | "ORDER_DEBIT"
  | "ORDER_REFUND";
