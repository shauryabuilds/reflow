// Paid plans. Prices and ExtensionPay plan nicknames live only here.
export interface PaidPlan {
  id: "monthly" | "annual";
  nickname: string; // ExtensionPay plan nickname
  price: number; // USD
  interval: "month" | "year";
}

export const PLANS: Record<PaidPlan["id"], PaidPlan> = {
  monthly: { id: "monthly", nickname: "pro-monthly", price: 7.99, interval: "month" },
  annual: { id: "annual", nickname: "pro-annual", price: 59.99, interval: "year" },
};

export const DEFAULT_PLAN: PaidPlan["id"] = "annual";
export const TRIAL_DAYS = 7;

/** Whole-percent saving of the annual plan vs 12 monthly payments. */
export function annualSavingsPct(): number {
  return Math.floor((1 - PLANS.annual.price / (PLANS.monthly.price * 12)) * 100);
}

/** Annual price expressed per month, rounded to whole dollars for the "≈ $5/month" label. */
export function annualPerMonth(): number {
  return Math.round(PLANS.annual.price / 12);
}
