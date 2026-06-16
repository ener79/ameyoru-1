import assert from "node:assert/strict";
import {
  calculateInvestorDashboard,
  type InvestorDashboardInput,
} from "../src/lib/investor-dashboard-calc";

const baseInput: InvestorDashboardInput = {
  orderRevenueCents: 100_000,
  giftRevenueCents: 50_000,
  orderCommissionCents: 10_000,
  giftCommissionCents: 7_500,
  operatingCostCents: 3_000,
  promotionCostCents: 2_000,
  fixedSalaryCents: 4_000,
  otherExpenseCents: 1_000,
  activePlayerCount: 4,
  newCustomerCount: 3,
  paidCustomerCount: 10,
  repeatCustomerCount: 4,
  customerBalanceCents: 20_000,
  playerDepositBalanceCents: 8_000,
  actualAccountBalanceCents: 40_000,
  totalInvestmentCents: 200_000,
  cumulativeNetProfitCents: 80_000,
  cumulativeDividendCents: 50_000,
  recent30DayNetProfitCents: 30_000,
  totalPlayerCount: 10,
  recent7DayGmvCents: 70_000,
  previous7DayGmvCents: 100_000,
  consecutiveNegativeProfitDays: 2,
};

const result = calculateInvestorDashboard(baseInput);

assert.equal(result.kpis.gmvCents, 150_000);
assert.equal(result.kpis.platformIncomeCents, 17_500);
assert.equal(result.kpis.netProfitCents, 7_500);
assert.equal(result.kpis.profitMargin, 7_500 / 17_500);
assert.equal(result.kpis.newCustomerCount, 3);
assert.equal(result.kpis.repeatRate, 0.4);
assert.equal(result.kpis.paidCustomerAverageCents, 15_000);
assert.equal(result.kpis.fundsGapCents, 12_000);

assert.equal(result.investor.undistributedProfitCents, 30_000);
assert.equal(result.investor.paybackRate, 0.25);
assert.equal(result.investor.estimatedPaybackDays, 150);

assert.deepEqual(
  result.risks.map((risk) => risk.code),
  ["gmv_drop", "negative_profit"]
);

const lowRepeat = calculateInvestorDashboard({
  ...baseInput,
  repeatCustomerCount: 2,
  recent7DayGmvCents: 90_000,
  actualAccountBalanceCents: 70_000,
  consecutiveNegativeProfitDays: 0,
  activePlayerCount: 3,
});

assert.ok(lowRepeat.risks.some((risk) => risk.code === "repeat_rate_low"));
assert.ok(lowRepeat.risks.some((risk) => risk.code === "player_activity_low"));

console.log("investor dashboard calculation tests passed");
