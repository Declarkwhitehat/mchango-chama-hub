/**
 * Commission rate constants
 */
export const MCHANGO_COMMISSION_RATE = 0.15; // 15%
export const CHAMA_DEFAULT_COMMISSION_RATE = 0.05; // 5% on-time
export const CHAMA_LATE_COMMISSION_RATE = 0.10; // 10% late
export const ORGANIZATION_COMMISSION_RATE = 0.05; // 5%

/**
 * Calculate commission amount
 */
export const calculateCommission = (amount: number, rate: number): number => {
  return amount * rate;
};

/**
 * Calculate net balance after commission
 */
export const calculateNetBalance = (amount: number, rate: number): number => {
  return amount - calculateCommission(amount, rate);
};

/**
 * Calculate per-transaction net amount
 */
export const calculateTransactionNet = (amount: number, rate: number): number => {
  return amount * (1 - rate);
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
    totalPayable: baseTotal + totalCommission,
  };
};

/**
 * Get commission info for Mchango
 */
export const getMchangoCommissionInfo = (totalAmount: number) => {
  const commission = calculateCommission(totalAmount, MCHANGO_COMMISSION_RATE);
  const netBalance = calculateNetBalance(totalAmount, MCHANGO_COMMISSION_RATE);
  
  return {
    totalAmount,
    commission,
    netBalance,
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
