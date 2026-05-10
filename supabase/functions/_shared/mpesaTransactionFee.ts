// M-PESA B2C transaction fee tiers (Safaricom).
// Returns the fee deducted from the requested amount, the cost portion paid to
// Safaricom, and the company revenue retained from each transaction.
export function getMpesaTransactionFee(amount: number) {
  if (amount <= 100)   return { transactionFee: 0,  safaricomCost: 0,  companyRevenue: 0 };
  if (amount <= 1500)  return { transactionFee: 15, safaricomCost: 5,  companyRevenue: 10 };
  if (amount <= 5000)  return { transactionFee: 27, safaricomCost: 9,  companyRevenue: 18 };
  if (amount <= 20000) return { transactionFee: 33, safaricomCost: 11, companyRevenue: 22 };
  return                      { transactionFee: 39, safaricomCost: 13, companyRevenue: 26 };
}
