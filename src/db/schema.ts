import {
  mysqlTable,
  varchar,
  text,
  int,
  boolean,
  datetime,
  mysqlEnum,
  index,
} from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

/**
 * 字符串主键统一长度。原 SQLite 用 string id(better-auth 默认 cuid 风格,通常 < 40 字符),
 * 留 64 字符余量。所有外键引用列也需要保持同样长度,MySQL 才能创建外键索引。
 */
const ID_LEN = 64;

/**
 * 时间列统一精度。datetime(3) 提供毫秒精度,范围 1000-9999 年,
 * 无 MySQL `timestamp` 列的 2038 问题与隐式时区转换。
 * mode: "date" 让 Drizzle 自动把存取层转成 JS Date。
 */
const ts = (name: string) =>
  datetime(name, { mode: "date", fsp: 3 });

/* ----------------------------- Better Auth 标准表 ----------------------------- */

export const user = mysqlTable("user", {
  id: varchar("id", { length: ID_LEN }).primaryKey(),
  name: varchar("name", { length: 191 }).notNull(),
  // Better Auth 要求 email 字段且 unique。我们用 username 登录,
  // 这里存放伪 email(`<username>@mo.local`)。
  email: varchar("email", { length: 191 }).notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(true),
  image: text("image"),
  createdAt: ts("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP(3)`),
  updatedAt: ts("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP(3)`),

  // username plugin 字段
  username: varchar("username", { length: 64 }).unique(),
  displayUsername: varchar("display_username", { length: 64 }),

  // 业务字段
  // BOSS = 店主(全权限);STAFF = 客服/店长(派单/看数据,不管员工);PLAYER = 陪玩
  role: mysqlEnum("role", ["BOSS", "STAFF", "PLAYER"])
    .notNull()
    .default("PLAYER"),
  active: boolean("active").notNull().default(true),
  playerGender: mysqlEnum("player_gender", ["MALE", "FEMALE"]),
  defaultRateCents: int("default_rate_cents"),
  mustChangePwd: boolean("must_change_pwd").notNull().default(true),
  wechatQrPath: varchar("wechat_qr_path", { length: 500 }),
  alipayQrPath: varchar("alipay_qr_path", { length: 500 }),
  qrSecurityCodeHash: varchar("qr_security_code_hash", { length: 255 }),
  depositPaid: boolean("deposit_paid").notNull().default(false),
  lastGiftSeenAt: ts("last_gift_seen_at"),
});

export const session = mysqlTable("session", {
  id: varchar("id", { length: ID_LEN }).primaryKey(),
  expiresAt: ts("expires_at").notNull(),
  token: varchar("token", { length: 255 }).notNull().unique(),
  createdAt: ts("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP(3)`),
  updatedAt: ts("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP(3)`),
  ipAddress: varchar("ip_address", { length: 64 }),
  userAgent: text("user_agent"),
  userId: varchar("user_id", { length: ID_LEN })
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = mysqlTable("account", {
  id: varchar("id", { length: ID_LEN }).primaryKey(),
  accountId: varchar("account_id", { length: 255 }).notNull(),
  providerId: varchar("provider_id", { length: 64 }).notNull(),
  userId: varchar("user_id", { length: ID_LEN })
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: ts("access_token_expires_at"),
  refreshTokenExpiresAt: ts("refresh_token_expires_at"),
  scope: varchar("scope", { length: 255 }),
  password: varchar("password", { length: 255 }),
  createdAt: ts("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP(3)`),
  updatedAt: ts("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP(3)`),
});

export const verification = mysqlTable("verification", {
  id: varchar("id", { length: ID_LEN }).primaryKey(),
  identifier: varchar("identifier", { length: 255 }).notNull(),
  value: text("value").notNull(),
  expiresAt: ts("expires_at").notNull(),
  createdAt: ts("created_at").default(sql`CURRENT_TIMESTAMP(3)`),
  updatedAt: ts("updated_at").default(sql`CURRENT_TIMESTAMP(3)`),
});

/* ------------------------------- 业务表 ------------------------------- */

export const customer = mysqlTable(
  "customer",
  {
    id: varchar("id", { length: ID_LEN }).primaryKey(),
    // 7 位数字会员号,创建时生成,unique
    memberNo: varchar("member_no", { length: 16 }).notNull().unique(),
    name: varchar("name", { length: 64 }).notNull(),
    // 客户微信(仅 BOSS/STAFF 可见,陪玩看不到)
    wechat: varchar("wechat", { length: 64 }),
    note: text("note"),
    balanceCents: int("balance_cents").notNull().default(0),
    createdAt: ts("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`),
  },
  (t) => [
    index("customer_name_idx").on(t.name),
    index("customer_wechat_idx").on(t.wechat),
  ]
);

export const playerInvite = mysqlTable(
  "player_invite",
  {
    id: varchar("id", { length: ID_LEN }).primaryKey(),
    inviteToken: varchar("invite_token", { length: 128 }).notNull().unique(),
    createdById: varchar("created_by_id", { length: ID_LEN })
      .notNull()
      .references(() => user.id),
    playerGender: mysqlEnum("player_gender", ["MALE", "FEMALE"]),
    defaultRateCents: int("default_rate_cents"),
    expiresAt: ts("expires_at").notNull(),
    maxUses: int("max_uses").notNull().default(1),
    useCount: int("use_count").notNull().default(0),
    usedAt: ts("used_at"),
    usedById: varchar("used_by_id", { length: ID_LEN }).references(
      () => user.id
    ),
    createdAt: ts("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`),
  },
  (t) => [
    index("player_invite_token_idx").on(t.inviteToken),
    index("player_invite_created_by_idx").on(t.createdById, t.createdAt),
  ]
);

export const order = mysqlTable(
  "order",
  {
    id: varchar("id", { length: ID_LEN }).primaryKey(),
    dispatcherId: varchar("dispatcher_id", { length: ID_LEN })
      .notNull()
      .references(() => user.id),
    playerId: varchar("player_id", { length: ID_LEN })
      .notNull()
      .references(() => user.id),
    customerId: varchar("customer_id", { length: ID_LEN })
      .notNull()
      .references(() => customer.id),

    startAt: ts("start_at").notNull(),
    endAt: ts("end_at").notNull(),
    durationMin: int("duration_min").notNull(),

    hourlyRateCents: int("hourly_rate_cents").notNull(),
    commissionPerHourCents: int("commission_per_hour_cents").notNull(),

    // 三段定价(单位:分)
    // - originalCents = 单价 × 时长(自动算)
    // - discountCents = 优惠金额(默认 0,管理者可设)
    // - payableCents  = 客户实付 = original - discount
    originalCents: int("original_cents").notNull(),
    discountCents: int("discount_cents").notNull().default(0),
    payableCents: int("payable_cents").notNull(),
    prepayUsedCents: int("prepay_used_cents").notNull().default(0),

    // 陪玩按"原价"结算,不受打折影响(陪玩拿足)
    commissionCents: int("commission_cents").notNull(),
    playerEarnCents: int("player_earn_cents").notNull(),

    orderStatus: mysqlEnum("order_status", [
      "IN_PROGRESS",
      "COMPLETED",
      "CANCELED",
    ])
      .notNull()
      .default("IN_PROGRESS"),
    completedAt: ts("completed_at"),
    canceledAt: ts("canceled_at"),

    // 取消时记录的纠纷信息(仅 CANCELED 时有意义)
    cancelFault: mysqlEnum("cancel_fault", [
      "PLAYER",
      "CUSTOMER",
      "SHOP",
      "OTHER",
    ]),
    cancelNote: text("cancel_note"),
    /** 取消单给陪玩的补偿金额。> 0 时此单仍需走结算流程 */
    playerCompensationCents: int("player_compensation_cents")
      .notNull()
      .default(0),

    settleStatus: mysqlEnum("settle_status", ["UNSETTLED", "SETTLED"])
      .notNull()
      .default("UNSETTLED"),
    settledAt: ts("settled_at"),
    paidMethod: mysqlEnum("paid_method", ["WECHAT", "ALIPAY"]),

    note: text("note"),

    createdAt: ts("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`),
  },
  (t) => [
    index("order_player_idx").on(t.playerId, t.startAt),
    index("order_dispatcher_idx").on(t.dispatcherId),
    index("order_status_idx").on(t.orderStatus, t.settleStatus),
    index("order_customer_idx").on(t.customerId),
    index("order_start_at_idx").on(t.startAt),
  ]
);

export const customerBalanceTxn = mysqlTable(
  "customer_balance_txn",
  {
    id: varchar("id", { length: ID_LEN }).primaryKey(),
    customerId: varchar("customer_id", { length: ID_LEN })
      .notNull()
      .references(() => customer.id),
    orderId: varchar("order_id", { length: ID_LEN }).references(
      () => order.id
    ),
    type: mysqlEnum("type", [
      "DEPOSIT",
      "ORDER_DEBIT",
      "ORDER_REFUND",
      "MANUAL_DEDUCT",
    ]).notNull(),
    amountCents: int("amount_cents").notNull(),
    note: text("note"),
    createdById: varchar("created_by_id", { length: ID_LEN })
      .notNull()
      .references(() => user.id),
    createdAt: ts("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`),
  },
  (t) => [
    index("customer_balance_txn_customer_idx").on(t.customerId, t.createdAt),
    index("customer_balance_txn_order_idx").on(t.orderId),
  ]
);

/**
 * MANUAL_DEDUCT 交易关联的陪玩(老板从客户预存里抽走金额时,记录是给哪些陪玩分账)。
 * 一笔扣减可关联多个陪玩。
 */
export const customerBalanceTxnPlayer = mysqlTable(
  "customer_balance_txn_player",
  {
    id: varchar("id", { length: ID_LEN }).primaryKey(),
    txnId: varchar("txn_id", { length: ID_LEN })
      .notNull()
      .references(() => customerBalanceTxn.id, { onDelete: "cascade" }),
    playerId: varchar("player_id", { length: ID_LEN })
      .notNull()
      .references(() => user.id),
  },
  (t) => [
    index("cbtp_txn_idx").on(t.txnId),
    index("cbtp_player_idx").on(t.playerId),
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
  | "ORDER_REFUND"
  | "MANUAL_DEDUCT";

/* ----------------------------- 公告 & 活动 ----------------------------- */

export const announcement = mysqlTable(
  "announcement",
  {
    id: varchar("id", { length: ID_LEN }).primaryKey(),
    type: mysqlEnum("type", ["NOTICE", "ACTIVITY"]).notNull().default("NOTICE"),
    title: varchar("title", { length: 100 }).notNull(),
    content: text("content"),
    contentJson: text("content_json"),
    imagePath: varchar("image_path", { length: 500 }),
    isPermanent: boolean("is_permanent").notNull().default(false),
    startAt: ts("start_at"),
    endAt: ts("end_at"),
    sortOrder: int("sort_order").notNull().default(0),
    enabled: boolean("enabled").notNull().default(true),
    createdById: varchar("created_by_id", { length: ID_LEN }).notNull(),
    createdAt: ts("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`),
  },
  (t) => [index("idx_announcement_enabled").on(t.enabled, t.sortOrder)]
);

export const siteSettings = mysqlTable("site_settings", {
  id: varchar("id", { length: ID_LEN }).primaryKey(),
  siteName: varchar("site_name", { length: 100 }).notNull().default("起点乱斗"),
  logoPath: varchar("logo_path", { length: 500 }),
  contactInfo: varchar("contact_info", { length: 500 }),
  footerText: varchar("footer_text", { length: 500 }),
  themePreset: varchar("theme_preset", { length: 30 }).notNull().default("default"),
  customThemeCSS: text("custom_theme_css"),
  borderRadius: varchar("border_radius", { length: 10 }),
  updatedAt: ts("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP(3)`),
});

export type AnnouncementType = "NOTICE" | "ACTIVITY";

/* ----------------------------- 操作日志 ----------------------------- */

export const auditLog = mysqlTable(
  "audit_log",
  {
    id: varchar("id", { length: ID_LEN }).primaryKey(),
    actorId: varchar("actor_id", { length: ID_LEN }).notNull(),
    actorName: varchar("actor_name", { length: 64 }).notNull(),
    action: varchar("action", { length: 50 }).notNull(),
    targetType: varchar("target_type", { length: 30 }).notNull(),
    targetId: varchar("target_id", { length: ID_LEN }),
    detail: text("detail"),
    createdAt: ts("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`),
  },
  (t) => [
    index("audit_log_actor_idx").on(t.actorId, t.createdAt),
    index("audit_log_target_idx").on(t.targetType, t.targetId),
    index("audit_log_created_idx").on(t.createdAt),
  ]
);

/* ----------------------------- 礼物打赏记录 ----------------------------- */

/**
 * 外部平台(抖音/直播/微信等)打赏礼物 → 老板内部转账给陪玩 → 此处仅做展示与抽成记账。
 *
 * 所有金额单位均为"分",与订单系统保持一致。
 * 抽成比例存当时的快照(feeRateBp),后续调整不影响历史记录。
 * giftTier 限制为 6 个固定档位(分),便于统计与防止误输。
 */
export const GIFT_TIER_CENTS = [6800, 12800, 25800, 52000, 131400, 520000] as const;
export type GiftTierCents = (typeof GIFT_TIER_CENTS)[number];

export const giftRecord = mysqlTable(
  "gift_record",
  {
    id: varchar("id", { length: ID_LEN }).primaryKey(),
    playerId: varchar("player_id", { length: ID_LEN })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    giftTierCents: int("gift_tier_cents").notNull(),
    quantity: int("quantity").notNull().default(1),
    totalCents: int("total_cents").notNull(),
    feeRateBp: int("fee_rate_bp").notNull(),
    platformFeeCents: int("platform_fee_cents").notNull(),
    playerEarnCents: int("player_earn_cents").notNull(),
    senderNickname: varchar("sender_nickname", { length: 100 }).notNull(),
    note: varchar("note", { length: 500 }),
    operatorId: varchar("operator_id", { length: ID_LEN }).notNull(),
    /** 提交人: 陪玩自填 = playerId 本人,后台代填 = BOSS/STAFF id */
    submitterId: varchar("submitter_id", { length: ID_LEN }).notNull(),
    /** 支付状态: UNSETTLED = 待支付, SETTLED = 已支付 */
    settleStatus: mysqlEnum("settle_status", ["UNSETTLED", "SETTLED"])
      .notNull()
      .default("UNSETTLED"),
    settledAt: ts("settled_at"),
    paidMethod: mysqlEnum("paid_method", ["WECHAT", "ALIPAY"]),
    createdAt: ts("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`),
    updatedAt: ts("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`),
  },
  (t) => [
    index("gift_record_player_idx").on(t.playerId, t.createdAt),
    index("gift_record_created_idx").on(t.createdAt),
    index("gift_record_settle_idx").on(t.settleStatus, t.createdAt),
    index("gift_record_sender_idx").on(t.senderNickname),
  ]
);
