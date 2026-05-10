// M-PESA B2C transaction fee tiers (Safaricom). Mirror of the Edge Function
// helper at supabase/functions/_shared/mpesaTransactionFee.ts. Keep both in sync.
export function getMpesaTransactionFee(amount: number) {
  if (amount <= 100)   return { transactionFee: 0,  safaricomCost: 0,  companyRevenue: 0 };
  if (amount <= 1500)  return { transactionFee: 15, safaricomCost: 5,  companyRevenue: 10 };
  if (amount <= 5000)  return { transactionFee: 27, safaricomCost: 9,  companyRevenue: 18 };
  if (amount <= 20000) return { transactionFee: 33, safaricomCost: 11, companyRevenue: 22 };
  return                      { transactionFee: 39, safaricomCost: 13, companyRevenue: 26 };
}
