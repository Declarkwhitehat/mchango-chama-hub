/**
 * Commission rate constants
 */
export const MCHANGO_COMMISSION_RATE = 0.07; // 7%
export const CHAMA_DEFAULT_COMMISSION_RATE = 0.05; // 5% on-time
/**
 * Late payment model: member pays contribution × 1.10.
 *  - penalty = contribution × 0.10  → platform earnings (chama_late_penalty)
 *  - commission = contribution × 0.05 → platform earnings (chama_commission)
 *  - net to chama pool = contribution × 0.95
 * The constant below is the PENALTY rate on top of the base contribution
 * (NOT a deductive commission against the gross paid).
 */
export const CHAMA_LATE_PENALTY_RATE = 0.10; // 10% surcharge added to base
export const CHAMA_LATE_COMMISSION_RATE = 0.10; // legacy alias — total platform take rate (0.10 + 0.05*… see helper)
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
 * Late payment math (single source of truth).
 *  - gross_due   = C * 1.10  (member pays 110% of contribution)
 *  - penalty     = C * 0.10  → platform earnings
 *  - commission  = C * 0.05  → platform earnings
 *  - net_to_pool = C * 0.95  → chama pool (or routed to a shortchanged beneficiary)
 */
export const calculateLatePayment = (baseContribution: number) => {
  const grossDue = baseContribution * 1.10;
  const penalty = baseContribution * 0.10;
  const commission = baseContribution * 0.05;
  const netToPool = baseContribution * 0.95;
  return { grossDue, penalty, commission, netToPool };
};

/**
 * Calculate the total amount a member needs to pay for N cycles.
 *  - On-time cycles: base only (5% commission deducted from within → 0.95C net to pool)
 *  - Late cycles: member pays 1.10C; 0.10C penalty + 0.05C commission → platform; 0.95C → pool
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
  latePenalty: number;
  totalCommission: number;
  totalPayable: number;
} => {
  const onTimeCycles = currentCycleDue ? 1 : 0;
  const lateCycles = missedCycles;

  const onTimeBase = onTimeCycles * baseContribution;
  const lateBase = lateCycles * baseContribution;
  const baseTotal = onTimeBase + lateBase;

  // On-time: 5% deductive commission on the base
  const onTimeCommission = onTimeBase * CHAMA_DEFAULT_COMMISSION_RATE;
  // Late: penalty 10% + commission 5% (both on the base, both go to platform)
  const latePenalty = lateBase * 0.10;
  const lateCommission = lateBase * 0.05;
  const totalCommission = onTimeCommission + lateCommission + latePenalty;

  return {
    onTimeCycles,
    lateCycles,
    baseTotal,
    onTimeCommission,
    lateCommission,
    latePenalty,
    totalCommission,
    // Member actually sends: on-time at face value + late cycles at 110% of base
    totalPayable: onTimeBase + lateBase * 1.10,
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
