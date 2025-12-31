/**
 * Normalize phone number to 254XXXXXXXXX format (without + prefix)
 * Accepts: +254XXXXXXXXX, 0XXXXXXXXX, 254XXXXXXXXX, 7XXXXXXXX
 * Returns: 254XXXXXXXXX or null if invalid
 */
export const normalizePhone = (phone: string): string | null => {
  if (!phone) return null;
  
  // Remove all non-digits
  const digits = phone.replace(/\D/g, '');
  
  // Handle different formats
  if (digits.startsWith('254') && digits.length === 12) {
    return digits; // Already 254XXXXXXXXX
  }
  if (digits.startsWith('0') && digits.length === 10) {
    return '254' + digits.substring(1); // 0XXXXXXXXX → 254XXXXXXXXX
  }
  if (digits.length === 9 && /^[17]/.test(digits)) {
    return '254' + digits; // 7XXXXXXXX or 1XXXXXXXX → 254XXXXXXXXX
  }
  
  return null; // Invalid format
};

/**
 * Validate if phone can be normalized to a valid Kenyan format
 */
export const isValidKenyanPhone = (phone: string): boolean => {
  return normalizePhone(phone) !== null;
};

/**
 * Format phone for display (with country code)
 */
export const formatPhoneDisplay = (phone: string): string => {
  const normalized = normalizePhone(phone);
  if (!normalized) return phone;
  return `+${normalized}`;
};
