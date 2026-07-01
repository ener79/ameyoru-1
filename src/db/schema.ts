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
  // BOSS = 店主(全权限);STAFF = 店长(派单/看数据/结算);SERVICE = 客服(派单/看数据,不能结算/管人);PLAYER = 陪玩
  role: mysqlEnum("role", ["BOSS", "STAFF", "SERVICE", "PLAYER"])
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
    // 小程序顾客微信登录身份:openid 唯一。与上面 wechat(微信号,店员手填可见)不同,
    // 这是顾客自己微信登录小程序时换来的 openid,用于认领/自动建档。
    wechatOpenid: varchar("wechat_openid", { length: 64 }).unique(),
    // 首次微信登录自动建档时,从小程序带来的资料(可选)
    mpNickname: varchar("mp_nickname", { length: 64 }),
    mpAvatarUrl: varchar("mp_avatar_url", { length: 500 }),
    checkinStreak: int("checkin_streak").notNull().default(0),
    lastCheckinAt: ts("last_checkin_at"),
    // 营销资产可消耗货币(缓存余额,流水见 customer_asset_txn,二者同事务更新)
    diceCount: int("dice_count").notNull().default(0),
    drawTickets: int("draw_tickets").notNull().default(0),
    // 已发放的累计时长里程碑等级(最后一档),防止满4h抽券重复发放。0=未达任何档。
    hoursTicketLevel: int("hours_ticket_level").notNull().default(0),
    monopolyPos: int("monopoly_pos").notNull().default(0),
    cardTop: int("card_top").notNull().default(0),
    cardJungle: int("card_jungle").notNull().default(0),
    cardMid: int("card_mid").notNull().default(0),
    cardAdc: int("card_adc").notNull().default(0),
    cardSupport: int("card_support").notNull().default(0),
    createdAt: ts("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`),
  },
  (t) => [
    index("customer_name_idx").on(t.name),
    index("customer_wechat_idx").on(t.wechat),
    index("customer_wechat_openid_idx").on(t.wechatOpenid),
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

    orderType: mysqlEnum("order_type", ["NORMAL", "REST"])
      .notNull()
      .default("NORMAL"),

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

    collectorName: varchar("collector_name", { length: 100 }),
    gameServer: varchar("game_server", { length: 50 }),

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
      "SERVICE_DEDUCT",
      "REVERSAL",
    ]).notNull(),
    amountCents: int("amount_cents").notNull(),
    reversedTxnId: varchar("reversed_txn_id", { length: ID_LEN }),
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

/**
 * 顾客营销资产流水(骰子/抽券)。每次发放/消耗追加一行,delta 正为发放、负为消耗。
 * 缓存余额在 customer.diceCount / drawTickets,与本表在同一事务内更新保证一致。
 */
export const customerAssetTxn = mysqlTable(
  "customer_asset_txn",
  {
    id: varchar("id", { length: ID_LEN }).primaryKey(),
    customerId: varchar("customer_id", { length: ID_LEN })
      .notNull()
      .references(() => customer.id),
    assetType: mysqlEnum("asset_type", ["DICE", "DRAW"]).notNull(),
    delta: int("delta").notNull(),
    reason: mysqlEnum("reason", [
      "CHECKIN",
      "WHEEL_DRAW",
      "WHEEL_REFUND",
      "MONOPOLY_ROLL",
      "PLAY_HOURS",
    ]).notNull(),
    // 关联来源 id(如签到记录/抽券记录),可空
    refId: varchar("ref_id", { length: ID_LEN }),
    note: text("note"),
    createdAt: ts("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`),
  },
  (t) => [index("customer_asset_txn_customer_idx").on(t.customerId, t.createdAt)]
);

/**
 * 顾客卡券实例(下单折扣券)。来源:签到 / 抽券 / 大富翁 / 集卡兑换。
 */
export const customerCoupon = mysqlTable(
  "customer_coupon",
  {
    id: varchar("id", { length: ID_LEN }).primaryKey(),
    customerId: varchar("customer_id", { length: ID_LEN })
      .notNull()
      .references(() => customer.id),
    name: varchar("name", { length: 100 }).notNull(),
    // 折扣口径,如 "92折"
    discountLabel: varchar("discount_label", { length: 32 }).notNull(),
    threshold: varchar("threshold", { length: 100 }),
    source: mysqlEnum("source", [
      "CHECKIN",
      "WHEEL",
      "MONOPOLY",
      "CARD_EXCHANGE",
    ]).notNull(),
    status: mysqlEnum("status", ["UNUSED", "USED", "EXPIRED"])
      .notNull()
      .default("UNUSED"),
    expiresAt: ts("expires_at"),
    usedAt: ts("used_at"),
    createdAt: ts("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`),
  },
  (t) => [index("customer_coupon_customer_idx").on(t.customerId, t.status)]
);

/* ------------------------------- 类型 ------------------------------- */

export type Role = "BOSS" | "STAFF" | "SERVICE" | "PLAYER";
export type PlayerGender = "MALE" | "FEMALE";
export type OrderStatus = "IN_PROGRESS" | "COMPLETED" | "CANCELED";
export type SettleStatus = "UNSETTLED" | "SETTLED";
export type PayMethod = "WECHAT" | "ALIPAY";
export type CancelFault = "PLAYER" | "CUSTOMER" | "SHOP" | "OTHER";
export type OrderType = "NORMAL" | "REST";
export type CustomerBalanceTxnType =
  | "DEPOSIT"
  | "ORDER_DEBIT"
  | "ORDER_REFUND"
  | "MANUAL_DEDUCT"
  | "SERVICE_DEDUCT"
  | "REVERSAL";
export type AssetType = "DICE" | "DRAW";
export type CouponSource = "CHECKIN" | "WHEEL" | "MONOPOLY" | "CARD_EXCHANGE";

/* ----------------------------- 公告 & 活动 ----------------------------- */

export const announcement = mysqlTable(
  "announcement",
  {
    id: varchar("id", { length: ID_LEN }).primaryKey(),
    type: mysqlEnum("type", ["NOTICE", "ACTIVITY"]).notNull().default("NOTICE"),
    title: varchar("title", { length: 100 }).notNull(),
    content: text("content"),
    contentJson: text("content_json"),
    contentHtml: text("content_html"),
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
  unsettledWarnDays: int("unsettled_warn_days").notNull().default(5),
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

/* ----------------------------- 礼物模板 ----------------------------- */

export const giftTemplate = mysqlTable(
  "gift_template",
  {
    id: varchar("id", { length: ID_LEN }).primaryKey(),
    name: varchar("name", { length: 100 }).notNull(),
    priceCents: int("price_cents").notNull(),
    sortOrder: int("sort_order").notNull().default(0),
    active: boolean("active").notNull().default(true),
    createdAt: ts("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`),
  },
  (t) => [index("gift_template_active_idx").on(t.active, t.sortOrder)]
);

/* ----------------------------- 礼物打赏记录 ----------------------------- */

export const giftRecord = mysqlTable(
  "gift_record",
  {
    id: varchar("id", { length: ID_LEN }).primaryKey(),
    playerId: varchar("player_id", { length: ID_LEN })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    giftTierCents: int("gift_tier_cents").notNull(),
    giftName: varchar("gift_name", { length: 100 }),
    giftTemplateId: varchar("gift_template_id", { length: ID_LEN }),
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
