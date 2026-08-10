// Welfare loan terms — mirror of supabase/functions/_shared/loanTerms.ts.
// Keep both files in sync.

export type WelfareLoanType = "multiplier" | "shares";

export const LOAN_TERMS = {
  multiplier: {
    label: "Multiplier Loan",
    tagline: "Borrow up to 3× your shares",
    maxMultiple: 3,
    chargeRate: 0.1,
    welfareRate: 0.07,
    companyRate: 0.03,
    monthlyPenaltyRate: 0.05,
    termDays: 30,
    recoverFromShares: false,
  },
  shares: {
    label: "Shares Loan",
    tagline: "Borrow up to 75% of your shares",
    maxRatio: 0.75,
    chargeRate: 0.05,
    welfareRate: 0.025,
    companyRate: 0.025,
    monthlyPenaltyRate: 0,
    termDays: 30,
    recoverFromShares: true,
  },
} as const;

const round2 = (n: number) => Math.round(n * 100) / 100;

export function quoteLoan(type: WelfareLoanType, principal: number) {
  const t = LOAN_TERMS[type];
  const chargeAmount = round2(principal * t.chargeRate);
  const welfareShare = round2(principal * t.welfareRate);
  return {
    principal: round2(principal),
    chargeRate: t.chargeRate,
    chargeAmount,
    welfareShare,
    companyShare: round2(Math.max(chargeAmount - welfareShare, 0)),
    amountDisbursed: round2(principal - chargeAmount),
    repayable: round2(principal),
    termDays: t.termDays,
  };
}

export function maxLoanFor(type: WelfareLoanType, shares: number) {
  const s = Math.max(0, Number(shares) || 0);
  return type === "multiplier"
    ? Math.floor(s * LOAN_TERMS.multiplier.maxMultiple)
    : Math.floor(s * LOAN_TERMS.shares.maxRatio);
}

export const fmtKES = (n: number) => `KES ${Number(n || 0).toLocaleString("en-KE")}`;
