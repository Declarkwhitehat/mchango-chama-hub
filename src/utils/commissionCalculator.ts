/**
 * Commission rate constants
 */
export const MCHANGO_COMMISSION_RATE = 0.07; // 7%
export const CHAMA_DEFAULT_COMMISSION_RATE = 0.05; // 5% on-time
export const CHAMA_LATE_COMMISSION_RATE = 0.10; // 10% late
export const ORGANIZATION_COMMISSION_RATE = 0.05; // 5%

/**
 * Calculate commission amount (deductive — from within the payment)
 * Commission = grossPaid * rate
 */
export const calculateCommission = (grossAmount: number, rate: number): number => {
  return grossAmount * rate;
};

/**
 * Calculate gross amount (deductive model)
 * Member pays the base amount — commission is deducted from within.
 */
export const calculateGrossAmount = (baseAmount: number, _rate: number): number => {
  return baseAmount; // no markup — member pays exact base
};

/**
 * Calculate net balance after commission deduction
 * Net = grossPaid - commission = grossPaid * (1 - rate)
 */
export const calculateNetBalance = (grossAmount: number, rate: number): number => {
  return grossAmount * (1 - rate);
};

/**
 * Calculate per-transaction net amount from gross (deductive)
 */
export const calculateTransactionNet = (grossAmount: number, rate: number): number => {
  return grossAmount * (1 - rate);
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
 * Deductive model: member pays base amount, commission deducted from within.
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
  
  // Deductive model: commission is extracted FROM the base
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
    totalPayable: baseTotal, // member pays the base amount; commission deducted from within
  };
};

/**
 * Get commission info for Mchango (deductive)
 */
export const getMchangoCommissionInfo = (totalAmount: number) => {
  const commission = calculateCommission(totalAmount, MCHANGO_COMMISSION_RATE);
  const netBalance = totalAmount - commission;
  
  return {
    totalAmount,
    commission,
    grossAmount: totalAmount,
    netBalance, // what goes to campaign after deduction
    rate: MCHANGO_COMMISSION_RATE,
    percentage: formatCommissionPercentage(MCHANGO_COMMISSION_RATE),
  };
};

/**
 * Get commission info for Chama (deductive)
 */
export const getChamaCommissionInfo = (totalAmount: number, customRate?: number) => {
  const rate = customRate || CHAMA_DEFAULT_COMMISSION_RATE;
  const commission = calculateCommission(totalAmount, rate);
  const netBalance = totalAmount - commission;
  
  return {
    totalAmount,
    commission,
    grossAmount: totalAmount,
    netBalance, // what goes to pool after deduction
    rate,
    percentage: formatCommissionPercentage(rate),
  };
};
