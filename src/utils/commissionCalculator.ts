/**
 * Commission rate constants
 */
export const MCHANGO_COMMISSION_RATE = 0.07; // 7%
export const CHAMA_DEFAULT_COMMISSION_RATE = 0.05; // 5% on-time
export const CHAMA_LATE_COMMISSION_RATE = 0.10; // 10% late
export const ORGANIZATION_COMMISSION_RATE = 0.05; // 5%

/**
 * Calculate commission amount (additive — on top of base)
 */
export const calculateCommission = (amount: number, rate: number): number => {
  return amount * rate;
};

/**
 * Calculate gross amount including commission (additive model)
 * Member pays: base + commission
 */
export const calculateGrossAmount = (baseAmount: number, rate: number): number => {
  return baseAmount + calculateCommission(baseAmount, rate);
};

/**
 * Calculate net balance (base amount, since commission is added on top)
 */
export const calculateNetBalance = (grossAmount: number, rate: number): number => {
  return grossAmount / (1 + rate);
};

/**
 * Calculate per-transaction net amount from gross
 */
export const calculateTransactionNet = (grossAmount: number, rate: number): number => {
  return grossAmount / (1 + rate);
};

/**
 * Format commission percentage for display
 */
export const formatCommissionPercentage = (rate: number): string => {
  return `${(rate * 100).toFixed(0)}%`;
};

/**
 * Calculate the total amount a member needs to pay for N cycles,
 * factoring in tiered commission (5% on-time, 10% late).
 */
export const calculateAmountToPay = (
  baseContribution: number,
  missedCycles: number,
  currentCycleDue: boolean
): {
  onTimeCycles: number;
  lateCycles: number;
  baseTotal: number;
  onTimeCommission: number;
  lateCommission: number;
  totalCommission: number;
  totalPayable: number;
} => {
  const onTimeCycles = currentCycleDue ? 1 : 0;
  const lateCycles = missedCycles;
  
  const onTimeBase = onTimeCycles * baseContribution;
  const lateBase = lateCycles * baseContribution;
  const baseTotal = onTimeBase + lateBase;
  
  // Additive model: commission is ON TOP of base
  const onTimeCommission = onTimeBase * CHAMA_DEFAULT_COMMISSION_RATE;
  const lateCommission = lateBase * CHAMA_LATE_COMMISSION_RATE;
  const totalCommission = onTimeCommission + lateCommission;
  
  return {
    onTimeCycles,
    lateCycles,
    baseTotal,
    onTimeCommission,
    lateCommission,
    totalCommission,
    totalPayable: baseTotal + totalCommission, // commission added on top
  };
};

/**
 * Get commission info for Mchango
 */
export const getMchangoCommissionInfo = (totalAmount: number) => {
  const commission = calculateCommission(totalAmount, MCHANGO_COMMISSION_RATE);
  const grossAmount = totalAmount + commission;
  
  return {
    totalAmount,
    commission,
    grossAmount,
    netBalance: totalAmount, // base amount goes to campaign
    rate: MCHANGO_COMMISSION_RATE,
    percentage: formatCommissionPercentage(MCHANGO_COMMISSION_RATE),
  };
};

/**
 * Get commission info for Chama
 */
export const getChamaCommissionInfo = (totalAmount: number, customRate?: number) => {
  const rate = customRate || CHAMA_DEFAULT_COMMISSION_RATE;
  const commission = calculateCommission(totalAmount, rate);
  const netBalance = calculateNetBalance(totalAmount, rate);
  
  return {
    totalAmount,
    commission,
    netBalance,
    rate,
    percentage: formatCommissionPercentage(rate),
  };
};
