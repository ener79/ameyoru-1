import { and, count, desc, eq, gte, lte, sql, sum } from "drizzle-orm";
import { db } from "@/db";
import { customer, customerBalanceTxn, giftRecord, order, user } from "@/db/schema";
import {
  calculateInvestorDashboard,
  type InvestorDashboardInput,
} from "@/lib/investor-dashboard-calc";
import {
  dateKeyInShanghai,
  eachShanghaiDay,
  resolveInvestorDateRange,
  type InvestorRangePreset,
} from "@/lib/investor-dashboard-range";

type PayMethod = "WECHAT" | "ALIPAY" | "BANK" | "CASH" | "OTHER";

export interface InvestorDashboardQuery {
  preset?: string;
  from?: string;
  to?: string;
}

export interface InvestorDashboardPayload {
  range: {
    preset: InvestorRangePreset;
    label: string;
    from: string;
    to: string;
  };
  financeSource: "mock";
  baseMetrics: {
    orderRevenueCents: number;
    giftRevenueCents: number;
    orderCommissionCents: number;
    giftCommissionCents: number;
    recent30PlatformIncomeCents: number;
    activePlayerCount: number;
    newCustomerCount: number;
    paidCustomerCount: number;
    repeatCustomerCount: number;
    customerBalanceCents: number;
    playerDepositBalanceCents: number;
    totalPlayerCount: number;
    recent7DayGmvCents: number;
    previous7DayGmvCents: number;
  };
  financeInputs: {
    totalInvestmentCents: number;
    cumulativeNetProfitCents: number;
    cumulativeDividendCents: number;
    wechatBalanceCents: number;
    alipayBalanceCents: number;
    bankBalanceCents: number;
    operatingCostCents: number;
    promotionCostCents: number;
    fixedSalaryCents: number;
    otherExpenseCents: number;
  };
  cards: ReturnType<typeof calculateInvestorDashboard>["kpis"];
  investor: ReturnType<typeof calculateInvestorDashboard>["investor"];
  risks: ReturnType<typeof calculateInvestorDashboard>["risks"];
  trends: {
    gmv: Array<{ date: string; orderCents: number; giftCents: number; totalCents: number }>;
    income: Array<{ date: string; platformIncomeCents: number }>;
    profit: Array<{ date: string; incomeCents: number; costCents: number; netProfitCents: number }>;
    customers: Array<{ date: string; newCustomers: number; paidCustomers: number; repeatCustomers: number }>;
    players: Array<{ date: string; totalPlayers: number; activePlayers: number; activeRate: number }>;
  };
  tables: {
    orders: OrderDetailRow[];
    gifts: GiftDetailRow[];
    balances: BalanceRow[];
    deposits: DepositRow[];
  };
}

export interface OrderDetailRow {
  orderNo: string;
  date: string;
  customer: string;
  player: string;
  hours: number;
  unitPriceCents: number;
  amountCents: number;
  platformCommissionCents: number;
  playerIncomeCents: number;
  status: string;
}

export interface GiftDetailRow {
  date: string;
  customer: string;
  player: string;
  amountCents: number;
  platformCommissionCents: number;
  playerIncomeCents: number;
}

export interface ExpenseRow {
  id: string;
  date: string;
  type: "运营成本" | "推广成本" | "固定工资" | "其他支出";
  amountCents: number;
  payMethod: PayMethod;
  operator: string;
  note: string;
  voucherUrl: string;
}

export interface BalanceRow {
  customer: string;
  rechargeCents: number;
  bonusCents: number;
  consumedCents: number;
  remainingCents: number;
}

export interface DepositRow {
  player: string;
  amountCents: number;
  paidAt: string;
  status: "已缴纳" | "未缴纳";
  refunded: boolean;
}

const financeMock = {
  expenses: [
    { id: "exp-1", date: "2026-06-02", type: "推广成本", amountCents: 18_000, payMethod: "WECHAT", operator: "琛", note: "短视频投流测试", voucherUrl: "" },
    { id: "exp-2", date: "2026-06-05", type: "运营成本", amountCents: 8_800, payMethod: "ALIPAY", operator: "琛", note: "社群维护工具", voucherUrl: "" },
    { id: "exp-3", date: "2026-06-10", type: "固定工资", amountCents: 30_000, payMethod: "BANK", operator: "老板", note: "兼职运营工资", voucherUrl: "" },
    { id: "exp-4", date: "2026-06-12", type: "其他支出", amountCents: 5_000, payMethod: "WECHAT", operator: "老板", note: "设计物料", voucherUrl: "" },
  ] satisfies ExpenseRow[],
  accountSnapshots: [
    { date: "2026-06-16", wechatCents: 128_600, alipayCents: 96_300, bankCents: 220_000 },
  ],
  investments: [{ investor: "出资股东", amountCents: 26_100, date: "2026-05-20" }],
  dividends: [{ investor: "出资股东", amountCents: 35_000, date: "2026-06-15", payMethod: "BANK" as PayMethod }],
};

export async function getInvestorDashboard(
  query: InvestorDashboardQuery
): Promise<InvestorDashboardPayload> {
  const range = resolveInvestorDateRange(query);
  const previous7From = new Date(range.to.getTime() - 13 * 24 * 60 * 60 * 1000);
  const previous7To = new Date(range.to.getTime() - 7 * 24 * 60 * 60 * 1000);
  const recent30From = new Date(range.to.getTime() - 29 * 24 * 60 * 60 * 1000);

  const [
    orderRows,
    giftRows,
    customerBalanceRows,
    totalPlayerRows,
    activePlayerRows,
    paidCustomerRows,
    repeatCustomerRows,
    newCustomerRows,
    recent7GmvRows,
    previous7GmvRows,
    recent30OrderRows,
    recent30GiftRows,
    playerRows,
  ] = await Promise.all([
    orderDetails(range.from, range.to),
    giftDetails(range.from, range.to),
    db.select({ s: sum(customer.balanceCents).mapWith(Number) }).from(customer),
    db.select({ count: count() }).from(user).where(eq(user.role, "PLAYER")),
    activePlayers(range.from, range.to),
    paidCustomers(range.from, range.to),
    repeatCustomers(range.from, range.to),
    newCustomersByDay(range.from, range.to),
    gmvBetween(new Date(range.to.getTime() - 6 * 24 * 60 * 60 * 1000), range.to),
    gmvBetween(previous7From, previous7To),
    orderSummary(recent30From, range.to),
    giftSummary(recent30From, range.to),
    db
      .select({
        name: user.name,
        depositPaid: user.depositPaid,
        createdAt: user.createdAt,
      })
      .from(user)
      .where(eq(user.role, "PLAYER"))
      .orderBy(desc(user.createdAt)),
  ]);

  const totalPlayerCount = totalPlayerRows[0]?.count ?? 0;
  const activePlayerCount = activePlayerRows.length;
  const newCustomerCount = Array.from(newCustomerRows.values()).reduce(
    (sum, value) => sum + value,
    0
  );
  const paidCustomerCount = paidCustomerRows.length;
  const repeatCustomerCount = repeatCustomerRows.length;
  const customerBalanceCents = customerBalanceRows[0]?.s ?? 0;
  const deposits = buildDepositRows(playerRows);
  const playerDepositBalanceCents = deposits.reduce((sum, row) => sum + (row.refunded ? 0 : row.amountCents), 0);
  const expenses = filterExpenseRows(range.from, range.to);
  const expenseTotals = expenseTotalsByType(expenses);
  const latestAccount = financeMock.accountSnapshots[financeMock.accountSnapshots.length - 1];
  const actualAccountBalanceCents = latestAccount.wechatCents + latestAccount.alipayCents + latestAccount.bankCents;
  const orderRevenueCents = orderRows.reduce((sum, row) => sum + row.amountCents, 0);
  const giftRevenueCents = giftRows.reduce((sum, row) => sum + row.amountCents, 0);
  const orderCommissionCents = orderRows.reduce((sum, row) => sum + row.platformCommissionCents, 0);
  const giftCommissionCents = giftRows.reduce((sum, row) => sum + row.platformCommissionCents, 0);
  const recent30Expenses = filterExpenseRows(recent30From, range.to).reduce((sum, row) => sum + row.amountCents, 0);
  const recent30PlatformIncomeCents =
    recent30OrderRows.commissionCents + recent30GiftRows.platformFeeCents;
  const recent30NetProfitCents =
    recent30PlatformIncomeCents - recent30Expenses;
  const totalInvestmentCents = financeMock.investments.reduce((sum, row) => sum + row.amountCents, 0);
  const cumulativeDividendCents = financeMock.dividends.reduce((sum, row) => sum + row.amountCents, 0);
  const cumulativeNetProfitCents = recent30NetProfitCents;

  const calcInput: InvestorDashboardInput = {
    orderRevenueCents,
    giftRevenueCents,
    orderCommissionCents,
    giftCommissionCents,
    operatingCostCents: expenseTotals["运营成本"],
    promotionCostCents: expenseTotals["推广成本"],
    fixedSalaryCents: expenseTotals["固定工资"],
    otherExpenseCents: expenseTotals["其他支出"],
    activePlayerCount,
    newCustomerCount,
    paidCustomerCount,
    repeatCustomerCount,
    customerBalanceCents,
    playerDepositBalanceCents,
    actualAccountBalanceCents,
    totalInvestmentCents,
    cumulativeNetProfitCents,
    cumulativeDividendCents,
    recent30DayNetProfitCents: recent30NetProfitCents,
    totalPlayerCount,
    recent7DayGmvCents: recent7GmvRows.orderCents + recent7GmvRows.giftCents,
    previous7DayGmvCents: previous7GmvRows.orderCents + previous7GmvRows.giftCents,
    consecutiveNegativeProfitDays: consecutiveNegativeProfitDays(
      range.from,
      range.to,
      orderRows,
      giftRows,
      expenses
    ),
  };

  const calculated = calculateInvestorDashboard(calcInput);
  const trends = buildTrends({
    from: range.from,
    to: range.to,
    orders: orderRows,
    gifts: giftRows,
    expenses,
    newCustomers: newCustomerRows,
    totalPlayerCount,
  });

  return {
    range: {
      preset: range.preset,
      label: range.label,
      from: range.from.toISOString(),
      to: range.to.toISOString(),
    },
  financeSource: "mock",
    baseMetrics: {
      orderRevenueCents,
      giftRevenueCents,
      orderCommissionCents,
      giftCommissionCents,
      recent30PlatformIncomeCents,
      activePlayerCount,
      newCustomerCount,
      paidCustomerCount,
      repeatCustomerCount,
      customerBalanceCents,
      playerDepositBalanceCents,
      totalPlayerCount,
      recent7DayGmvCents: recent7GmvRows.orderCents + recent7GmvRows.giftCents,
      previous7DayGmvCents: previous7GmvRows.orderCents + previous7GmvRows.giftCents,
    },
    financeInputs: {
      totalInvestmentCents,
      cumulativeNetProfitCents,
      cumulativeDividendCents,
      wechatBalanceCents: latestAccount.wechatCents,
      alipayBalanceCents: latestAccount.alipayCents,
      bankBalanceCents: latestAccount.bankCents,
      operatingCostCents: expenseTotals["运营成本"],
      promotionCostCents: expenseTotals["推广成本"],
      fixedSalaryCents: expenseTotals["固定工资"],
      otherExpenseCents: expenseTotals["其他支出"],
    },
    cards: calculated.kpis,
    investor: calculated.investor,
    risks: calculated.risks,
    trends,
    tables: {
      orders: orderRows,
      gifts: giftRows,
      balances: await balanceRows(),
      deposits,
    },
  };
}

async function orderDetails(from: Date, to: Date): Promise<OrderDetailRow[]> {
  const rows = await db
    .select({
      orderNo: order.id,
      startAt: order.startAt,
      customerName: customer.name,
      playerName: user.name,
      durationMin: order.durationMin,
      hourlyRateCents: order.hourlyRateCents,
      amountCents: order.payableCents,
      platformCommissionCents: order.commissionCents,
      playerIncomeCents: order.playerEarnCents,
      status: order.orderStatus,
    })
    .from(order)
    .innerJoin(customer, eq(customer.id, order.customerId))
    .innerJoin(user, eq(user.id, order.playerId))
    .where(and(eq(order.orderStatus, "COMPLETED"), gte(order.startAt, from), lte(order.startAt, to)))
    .orderBy(desc(order.startAt))
    .limit(500);

  return rows.map((row) => ({
    orderNo: row.orderNo,
    date: row.startAt.toISOString(),
    customer: row.customerName,
    player: row.playerName,
    hours: row.durationMin / 60,
    unitPriceCents: row.hourlyRateCents,
    amountCents: row.amountCents,
    platformCommissionCents: row.platformCommissionCents,
    playerIncomeCents: row.playerIncomeCents,
    status: row.status,
  }));
}

async function giftDetails(from: Date, to: Date): Promise<GiftDetailRow[]> {
  const rows = await db
    .select({
      createdAt: giftRecord.createdAt,
      sender: giftRecord.senderNickname,
      playerName: user.name,
      amountCents: giftRecord.totalCents,
      platformCommissionCents: giftRecord.platformFeeCents,
      playerIncomeCents: giftRecord.playerEarnCents,
    })
    .from(giftRecord)
    .innerJoin(user, eq(user.id, giftRecord.playerId))
    .where(and(eq(giftRecord.settleStatus, "SETTLED"), gte(giftRecord.createdAt, from), lte(giftRecord.createdAt, to)))
    .orderBy(desc(giftRecord.createdAt))
    .limit(500);

  return rows.map((row) => ({
    date: row.createdAt.toISOString(),
    customer: row.sender,
    player: row.playerName,
    amountCents: row.amountCents,
    platformCommissionCents: row.platformCommissionCents,
    playerIncomeCents: row.playerIncomeCents,
  }));
}

async function activePlayers(from: Date, to: Date) {
  return db
    .select({ playerId: order.playerId })
    .from(order)
    .where(and(eq(order.orderStatus, "COMPLETED"), gte(order.startAt, from), lte(order.startAt, to)))
    .groupBy(order.playerId);
}

async function paidCustomers(from: Date, to: Date) {
  return db
    .select({ customerId: order.customerId })
    .from(order)
    .where(and(eq(order.orderStatus, "COMPLETED"), gte(order.startAt, from), lte(order.startAt, to)))
    .groupBy(order.customerId);
}

async function repeatCustomers(from: Date, to: Date) {
  return db
    .select({ customerId: order.customerId })
    .from(order)
    .where(and(eq(order.orderStatus, "COMPLETED"), gte(order.startAt, from), lte(order.startAt, to)))
    .groupBy(order.customerId)
    .having(sql`count(*) >= 2`);
}

async function newCustomersByDay(from: Date, to: Date) {
  const rows = await db
    .select({
      date: sql<string>`date(${customer.createdAt})`,
      count: count(),
    })
    .from(customer)
    .where(and(gte(customer.createdAt, from), lte(customer.createdAt, to)))
    .groupBy(sql`date(${customer.createdAt})`);
  return new Map(rows.map((row) => [row.date, row.count]));
}

async function orderSummary(from: Date, to: Date) {
  const [row] = await db
    .select({
      revenueCents: sum(order.payableCents).mapWith(Number),
      commissionCents: sum(order.commissionCents).mapWith(Number),
    })
    .from(order)
    .where(and(eq(order.orderStatus, "COMPLETED"), gte(order.startAt, from), lte(order.startAt, to)));
  return {
    revenueCents: row?.revenueCents ?? 0,
    commissionCents: row?.commissionCents ?? 0,
  };
}

async function giftSummary(from: Date, to: Date) {
  const [row] = await db
    .select({
      revenueCents: sum(giftRecord.totalCents).mapWith(Number),
      platformFeeCents: sum(giftRecord.platformFeeCents).mapWith(Number),
    })
    .from(giftRecord)
    .where(and(eq(giftRecord.settleStatus, "SETTLED"), gte(giftRecord.createdAt, from), lte(giftRecord.createdAt, to)));
  return {
    revenueCents: row?.revenueCents ?? 0,
    platformFeeCents: row?.platformFeeCents ?? 0,
  };
}

async function gmvBetween(from: Date, to: Date) {
  const [orders, gifts] = await Promise.all([orderSummary(from, to), giftSummary(from, to)]);
  return { orderCents: orders.revenueCents, giftCents: gifts.revenueCents };
}

async function balanceRows(): Promise<BalanceRow[]> {
  const rows = await db
    .select({
      id: customer.id,
      name: customer.name,
      remainingCents: customer.balanceCents,
      rechargeCents: sql<number>`coalesce(sum(case when ${customerBalanceTxn.type} = 'DEPOSIT' then ${customerBalanceTxn.amountCents} else 0 end), 0)`.mapWith(Number),
      consumedCents: sql<number>`abs(coalesce(sum(case when ${customerBalanceTxn.type} in ('ORDER_DEBIT', 'MANUAL_DEDUCT') then ${customerBalanceTxn.amountCents} else 0 end), 0))`.mapWith(Number),
    })
    .from(customer)
    .leftJoin(customerBalanceTxn, eq(customerBalanceTxn.customerId, customer.id))
    .groupBy(customer.id)
    .orderBy(desc(customer.balanceCents))
    .limit(200);

  return rows.map((row) => ({
    customer: row.name,
    rechargeCents: row.rechargeCents,
    bonusCents: 0,
    consumedCents: row.consumedCents,
    remainingCents: row.remainingCents,
  }));
}

function buildDepositRows(rows: Array<{ name: string; depositPaid: boolean; createdAt: Date }>): DepositRow[] {
  return rows.map((row) => ({
    player: row.name,
    amountCents: row.depositPaid ? 10_000 : 0,
    paidAt: row.depositPaid ? row.createdAt.toISOString() : "",
    status: row.depositPaid ? "已缴纳" : "未缴纳",
    refunded: false,
  }));
}

function filterExpenseRows(from: Date, to: Date): ExpenseRow[] {
  return financeMock.expenses.filter((row) => {
    const date = new Date(`${row.date}T00:00:00.000+08:00`);
    return date >= from && date <= to;
  });
}

function expenseTotalsByType(rows: ExpenseRow[]) {
  return rows.reduce(
    (acc, row) => {
      acc[row.type] += row.amountCents;
      return acc;
    },
    { 运营成本: 0, 推广成本: 0, 固定工资: 0, 其他支出: 0 }
  );
}

function buildTrends(args: {
  from: Date;
  to: Date;
  orders: OrderDetailRow[];
  gifts: GiftDetailRow[];
  expenses: ExpenseRow[];
  newCustomers: Map<string, number>;
  totalPlayerCount: number;
}): InvestorDashboardPayload["trends"] {
  const days = eachShanghaiDay(args.from, args.to);
  const orderMap = sumByDate(args.orders, "amountCents");
  const giftMap = sumByDate(args.gifts, "amountCents");
  const orderFeeMap = sumByDate(args.orders, "platformCommissionCents");
  const giftFeeMap = sumByDate(args.gifts, "platformCommissionCents");
  const expenseMap = new Map<string, number>();
  for (const row of args.expenses) {
    expenseMap.set(row.date, (expenseMap.get(row.date) ?? 0) + row.amountCents);
  }

  const paidCustomersByDate = countCustomersByDate(args.orders);
  const repeatCustomersByDate = repeatCustomersByDateMap(args.orders);
  const activePlayersByDate = countPlayersByDate(args.orders);

  return {
    gmv: days.map((date) => {
      const orderCents = orderMap.get(date) ?? 0;
      const giftCents = giftMap.get(date) ?? 0;
      return { date, orderCents, giftCents, totalCents: orderCents + giftCents };
    }),
    income: days.map((date) => ({
      date,
      platformIncomeCents: (orderFeeMap.get(date) ?? 0) + (giftFeeMap.get(date) ?? 0),
    })),
    profit: days.map((date) => {
      const incomeCents = (orderFeeMap.get(date) ?? 0) + (giftFeeMap.get(date) ?? 0);
      const costCents = expenseMap.get(date) ?? 0;
      return { date, incomeCents, costCents, netProfitCents: incomeCents - costCents };
    }),
    customers: days.map((date) => ({
      date,
      newCustomers: args.newCustomers.get(date) ?? 0,
      paidCustomers: paidCustomersByDate.get(date) ?? 0,
      repeatCustomers: repeatCustomersByDate.get(date) ?? 0,
    })),
    players: days.map((date) => {
      const activePlayers = activePlayersByDate.get(date) ?? 0;
      return {
        date,
        totalPlayers: args.totalPlayerCount,
        activePlayers,
        activeRate: args.totalPlayerCount ? activePlayers / args.totalPlayerCount : 0,
      };
    }),
  };
}

function sumByDate<T extends { date: string }>(rows: T[], key: keyof T) {
  const result = new Map<string, number>();
  for (const row of rows) {
    const date = dateKeyInShanghai(new Date(row.date));
    result.set(date, (result.get(date) ?? 0) + Number(row[key] ?? 0));
  }
  return result;
}

function countCustomersByDate(rows: OrderDetailRow[]) {
  const buckets = new Map<string, Set<string>>();
  for (const row of rows) {
    const date = dateKeyInShanghai(new Date(row.date));
    if (!buckets.has(date)) buckets.set(date, new Set());
    buckets.get(date)!.add(row.customer);
  }
  return new Map([...buckets.entries()].map(([date, set]) => [date, set.size]));
}

function repeatCustomersByDateMap(rows: OrderDetailRow[]) {
  const buckets = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const date = dateKeyInShanghai(new Date(row.date));
    if (!buckets.has(date)) buckets.set(date, new Map());
    const map = buckets.get(date)!;
    map.set(row.customer, (map.get(row.customer) ?? 0) + 1);
  }
  return new Map([...buckets.entries()].map(([date, map]) => [date, [...map.values()].filter((count) => count >= 2).length]));
}

function countPlayersByDate(rows: OrderDetailRow[]) {
  const buckets = new Map<string, Set<string>>();
  for (const row of rows) {
    const date = dateKeyInShanghai(new Date(row.date));
    if (!buckets.has(date)) buckets.set(date, new Set());
    buckets.get(date)!.add(row.player);
  }
  return new Map([...buckets.entries()].map(([date, set]) => [date, set.size]));
}

function consecutiveNegativeProfitDays(
  from: Date,
  to: Date,
  orders: OrderDetailRow[],
  gifts: GiftDetailRow[],
  expenses: ExpenseRow[]
) {
  const trends = buildTrends({
    from,
    to,
    orders,
    gifts,
    expenses,
    newCustomers: new Map(),
    totalPlayerCount: 0,
  });
  let streak = 0;
  for (const row of [...trends.profit].reverse()) {
    if (row.netProfitCents < 0) streak += 1;
    else break;
  }
  return streak;
}
