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

/**
 * Validate Safaricom number using the full official prefix list.
 * Accepts (after normalising to 2547XXXXXXXX / 2541XXXXXXXX):
 *   - 070x, 071x, 072x, 074x, 075x, 076x, 079x  (07XX series)
 *   - 0110-0115                                 (011X series)
 * Reject everything else (Airtel/Telkom etc.).
 */
export const isSafaricomNumber = (phone: string): boolean => {
  const normalized = normalizePhone(phone);
  if (!normalized) return false;
  const local = normalized.slice(3); // strip "254"
  // 9-digit local part: first 3 chars decide network
  // 7XX series: 700-729 (70/71/72), 740-746 (74), 750-759 (75), 760-769 (76), 790-799 (79)
  if (/^7(0[0-9]|1[0-9]|2[0-9]|4[0-6]|5[0-9]|6[0-9]|9[0-9])/.test(local)) return true;
  // 1XX series: 110-115
  if (/^11[0-5]/.test(local)) return true;
  return false;
};
