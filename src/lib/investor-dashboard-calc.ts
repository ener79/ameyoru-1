export interface InvestorDashboardInput {
  orderRevenueCents: number;
  giftRevenueCents: number;
  orderCommissionCents: number;
  giftCommissionCents: number;
  operatingCostCents: number;
  promotionCostCents: number;
  fixedSalaryCents: number;
  otherExpenseCents: number;
  activePlayerCount: number;
  newCustomerCount: number;
  paidCustomerCount: number;
  repeatCustomerCount: number;
  customerBalanceCents: number;
  playerDepositBalanceCents: number;
  actualAccountBalanceCents: number;
  totalInvestmentCents: number;
  cumulativeNetProfitCents: number;
  cumulativeDividendCents: number;
  recent30DayNetProfitCents: number;
  totalPlayerCount: number;
  recent7DayGmvCents: number;
  previous7DayGmvCents: number;
  consecutiveNegativeProfitDays: number;
}

export type InvestorRiskCode =
  | "gmv_drop"
  | "repeat_rate_low"
  | "player_activity_low"
  | "negative_profit";

export interface InvestorRisk {
  code: InvestorRiskCode;
  level: "red" | "yellow";
  title: string;
  description: string;
}

export function calculateInvestorDashboard(input: InvestorDashboardInput) {
  const gmvCents = input.orderRevenueCents + input.giftRevenueCents;
  const platformIncomeCents =
    input.orderCommissionCents + input.giftCommissionCents;
  const totalCostCents =
    input.operatingCostCents +
    input.promotionCostCents +
    input.fixedSalaryCents +
    input.otherExpenseCents;
  const netProfitCents = platformIncomeCents - totalCostCents;
  const profitMargin = ratio(netProfitCents, platformIncomeCents);
  const repeatRate = ratio(input.repeatCustomerCount, input.paidCustomerCount);
  const paidCustomerAverageCents =
    input.paidCustomerCount > 0
      ? Math.round(gmvCents / input.paidCustomerCount)
      : 0;
  const activePlayerRate = ratio(input.activePlayerCount, input.totalPlayerCount);
  const undistributedProfitCents =
    input.cumulativeNetProfitCents - input.cumulativeDividendCents;
  const fundsGapCents =
    input.actualAccountBalanceCents -
    input.customerBalanceCents -
    input.playerDepositBalanceCents;
  const paybackRate = ratio(input.cumulativeDividendCents, input.totalInvestmentCents);
  const remainingPrincipalCents = Math.max(
    input.totalInvestmentCents - input.cumulativeDividendCents,
    0
  );
  const averageDailyNetProfitCents = input.recent30DayNetProfitCents / 30;
  const estimatedPaybackDays =
    averageDailyNetProfitCents > 0
      ? Math.ceil(remainingPrincipalCents / averageDailyNetProfitCents)
      : null;

  const risks: InvestorRisk[] = [];
  if (
    input.previous7DayGmvCents > 0 &&
    input.recent7DayGmvCents < input.previous7DayGmvCents * 0.8
  ) {
    risks.push({
      code: "gmv_drop",
      level: "yellow",
      title: "流水下滑",
      description: "最近7天 GMV 较上个7天下降超过 20%。",
    });
  }

  if (input.paidCustomerCount > 0 && repeatRate < 0.3) {
    risks.push({
      code: "repeat_rate_low",
      level: "yellow",
      title: "客户复购偏低",
      description: "当前时间段复购率低于 30%。",
    });
  }

  if (input.totalPlayerCount > 0 && activePlayerRate < 0.4) {
    risks.push({
      code: "player_activity_low",
      level: "yellow",
      title: "陪玩活跃不足",
      description: "当前时间段活跃陪玩率低于 40%。",
    });
  }

  if (input.consecutiveNegativeProfitDays >= 2) {
    risks.push({
      code: "negative_profit",
      level: "red",
      title: "项目亏损",
      description: "净利润连续为负，需要检查成本和推广投放。",
    });
  }

  return {
    kpis: {
      gmvCents,
      platformIncomeCents,
      netProfitCents,
      profitMargin,
      activePlayerCount: input.activePlayerCount,
      newCustomerCount: input.newCustomerCount,
      paidCustomerCount: input.paidCustomerCount,
      paidCustomerAverageCents,
      repeatRate,
      customerBalanceCents: input.customerBalanceCents,
      playerDepositBalanceCents: input.playerDepositBalanceCents,
      actualAccountBalanceCents: input.actualAccountBalanceCents,
      fundsGapCents,
      totalCostCents,
      activePlayerRate,
    },
    investor: {
      totalInvestmentCents: input.totalInvestmentCents,
      cumulativeNetProfitCents: input.cumulativeNetProfitCents,
      cumulativeDividendCents: input.cumulativeDividendCents,
      undistributedProfitCents,
      paybackRate,
      estimatedPaybackDays,
    },
    risks,
  };
}

function ratio(numerator: number, denominator: number) {
  if (!Number.isFinite(denominator) || denominator === 0) return 0;
  return numerator / denominator;
}
