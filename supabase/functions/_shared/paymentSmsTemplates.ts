// Shared SMS templates for payment confirmations.
// Sender ID (PAMOJANOVA) identifies the source — never prefix "Pamojanova:".
// No emojis. GSM-7 safe. Keep concise; total <= ~320 chars (2-part max).

const STOP = '\nSTOP 4569*5#';

const firstNameOf = (fullName?: string | null, fallback = 'Member'): string => {
  if (!fullName) return fallback;
  const first = String(fullName).trim().split(/\s+/)[0];
  return first || fallback;
};

const kes = (n: number): string => `KES ${Math.round(Number(n) || 0).toLocaleString()}`;

const outstandingLine = (shortfall: number, priorDebt: number): string => {
  const parts: string[] = [];
  if (shortfall > 0) parts.push(`You still owe ${kes(shortfall)} for this cycle.`);
  if (priorDebt > 0) parts.push(`You have ${kes(priorDebt)} in unpaid past contributions.`);
  return parts.length ? `\n${parts.join(' ')}` : '';
};

export interface ChamaPaymentSmsArgs {
  fullName?: string | null;
  chamaName: string;
  amount: number;
  receipt: string;
  shortfall?: number;
  priorDebt?: number;
}

export const formatChamaPaymentSms = (a: ChamaPaymentSmsArgs): string => {
  const name = firstNameOf(a.fullName);
  const dues = outstandingLine(a.shortfall || 0, a.priorDebt || 0);
  return `Hi ${name}, ${kes(a.amount)} received for "${a.chamaName}". Receipt: ${a.receipt}.${dues}${STOP}`;
};

export const formatChamaOnBehalfPayerSms = (args: {
  payerFullName?: string | null;
  beneficiaryFullName?: string | null;
  chamaName: string;
  amount: number;
  receipt: string;
}): string => {
  const payer = firstNameOf(args.payerFullName);
  const beneficiary = firstNameOf(args.beneficiaryFullName, 'a member');
  return `Hi ${payer}, ${kes(args.amount)} paid for ${beneficiary} in "${args.chamaName}". Receipt: ${args.receipt}.${STOP}`;
};

export const formatChamaOnBehalfBeneficiarySms = (args: {
  beneficiaryFullName?: string | null;
  payerFullName?: string | null;
  chamaName: string;
  amount: number;
  receipt: string;
  shortfall?: number;
  priorDebt?: number;
}): string => {
  const beneficiary = firstNameOf(args.beneficiaryFullName);
  const payer = firstNameOf(args.payerFullName, 'A member');
  const dues = outstandingLine(args.shortfall || 0, args.priorDebt || 0);
  return `Hi ${beneficiary}, ${payer} paid ${kes(args.amount)} toward your contribution in "${args.chamaName}". Receipt: ${args.receipt}.${dues}${STOP}`;
};

export const formatWelfarePaymentSms = (args: {
  fullName?: string | null;
  welfareName: string;
  amount: number;
  receipt: string;
  shares?: number | null;
}): string => {
  const name = firstNameOf(args.fullName);
  const sharesLine = (args.shares !== undefined && args.shares !== null)
    ? ` Your total shares in this welfare are now ${kes(args.shares)}.`
    : '';
  return `Hi ${name}, ${kes(args.amount)} received for "${args.welfareName}". Receipt: ${args.receipt}.${sharesLine}${STOP}`;
};

export const formatMchangoThankYouSms = (args: {
  donorFullName?: string | null;
  campaignName: string;
  amount: number;
  receipt?: string | null;
  raised?: number | null;
  goal?: number | null;
}): string => {
  const receiptLine = args.receipt ? ` Receipt: ${args.receipt}.` : '';
  let progress = '';
  if (args.raised !== undefined && args.raised !== null) {
    progress = ` Balance: ${kes(args.raised)}`;
    progress += (args.goal && args.goal > 0) ? ` of ${kes(args.goal)} target.` : '.';
  }
  return `Your ${kes(args.amount)} donation to "${args.campaignName}" has been received.${receiptLine}${progress}${STOP}`;
};

export const formatOrgThankYouSms = (args: {
  donorFullName?: string | null;
  organizationName: string;
  amount: number;
}): string => {
  return `Your ${kes(args.amount)} donation to "${args.organizationName}" has been received.${STOP}`;
};

// Professional contribution reminder: who, how much, how to pay, and by when.
export const formatContributionReminderSms = (args: {
  fullName?: string | null;
  groupName: string;
  amount: number;
  memberCode: string;
  dueText: string; // e.g. "5 Aug 2026 by 10:00 PM"
  balance?: number;
}): string => {
  const name = firstNameOf(args.fullName);
  const owed = args.balance && args.balance > 0 && args.balance !== args.amount
    ? ` Outstanding balance: ${kes(args.balance)}.`
    : '';
  return `Hi ${name}, your ${kes(args.amount)} contribution to "${args.groupName}" is due on ${args.dueText}.${owed} Pay via M-Pesa Paybill 4015351, Account ${args.memberCode}, or in the app. Thank you for keeping your group strong.${STOP}`;
};

