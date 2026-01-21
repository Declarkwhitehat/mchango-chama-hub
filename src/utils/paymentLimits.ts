export const PAYMENT_METHOD_LIMITS = {
  mpesa: {
    daily_limit: 150000,
    label: 'M-Pesa',
    currency: 'KES'
  },
  bank_account: {
    daily_limit: 500000,
    label: 'Bank Account',
    currency: 'KES'
  }
} as const;

export type PaymentMethodType = keyof typeof PAYMENT_METHOD_LIMITS;

export function getPaymentMethodLimit(methodType: PaymentMethodType): number {
  return PAYMENT_METHOD_LIMITS[methodType].daily_limit;
}

export function formatPaymentMethodLabel(methodType: string): string {
  const type = methodType as PaymentMethodType;
  return PAYMENT_METHOD_LIMITS[type]?.label || methodType;
}

export function formatPaymentMethodType(methodType: string): string {
  return methodType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}
