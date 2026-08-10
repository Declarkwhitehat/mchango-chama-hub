// Single source of truth for welfare loan terms.
// Mirrored on the frontend at src/utils/welfareLoanTerms.ts — keep both in sync.

export type WelfareLoanType = 'multiplier' | 'shares';

export const LOAN_TERMS = {
  multiplier: {
    label: 'Multiplier Loan',
    maxMultiple: 3,          // up to 3x shares
    chargeRate: 0.10,        // 10% deducted upfront
    welfareRate: 0.07,       // 7% welfare income
    companyRate: 0.03,       // 3% company revenue
    monthlyPenaltyRate: 0.05, // +5% per month while overdue
    termDays: 30,
    recoverFromShares: false,
  },
  shares: {
    label: 'Shares Loan',
    maxRatio: 0.75,          // up to 75% of shares
    chargeRate: 0.05,        // 5% deducted upfront
    welfareRate: 0.025,      // 2.5% welfare income
    companyRate: 0.025,      // 2.5% company revenue
    monthlyPenaltyRate: 0,
    termDays: 30,
    recoverFromShares: true, // outstanding is taken from shares on default
  },
} as const;

const round2 = (n: number) => Math.round(n * 100) / 100;

export function quoteLoan(type: WelfareLoanType, principal: number) {
  const t = LOAN_TERMS[type];
  const chargeAmount = round2(principal * t.chargeRate);
  const welfareShare = round2(principal * t.welfareRate);
  const companyShare = round2(chargeAmount - round2(principal * t.welfareRate));
  return {
    principal: round2(principal),
    chargeRate: t.chargeRate,
    chargeAmount,
    welfareShare,
    companyShare: round2(Math.max(companyShare, 0)),
    amountDisbursed: round2(principal - chargeAmount),
    repayable: round2(principal),
    termDays: t.termDays,
  };
}

export function maxLoanFor(type: WelfareLoanType, shares: number) {
  const s = Math.max(0, Number(shares) || 0);
  return type === 'multiplier'
    ? Math.floor(s * LOAN_TERMS.multiplier.maxMultiple)
    : Math.floor(s * LOAN_TERMS.shares.maxRatio);
}
