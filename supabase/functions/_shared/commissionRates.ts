// Single source of truth for all commission rates across the platform
// Used by both edge functions (backend) and can be referenced by frontend

export const COMMISSION_RATES = {
  /** Chama (rotating savings) - 5% on-time commission */
  CHAMA: 0.05,
  /** Mchango (fundraising campaigns) - 7% commission */
  MCHANGO: 0.07,
  /** Organizations - 5% commission */
  ORGANIZATION: 0.05,
  /** Welfare groups - 5% commission */
  WELFARE: 0.05,
} as const;
