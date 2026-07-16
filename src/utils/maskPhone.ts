export function maskPhone(phone?: string | null): string {
  if (!phone) return "-";
  const digits = String(phone).replace(/\D/g, "");
  if (digits.length < 5) return "***";
  // Normalize leading country code 254 -> 0 for display
  const local = digits.startsWith("254") ? "0" + digits.slice(3) : digits;
  const prefix = local.slice(0, 3);
  const last = local.slice(-1);
  const middleLen = Math.max(0, local.length - 4);
  return `${prefix}${"*".repeat(middleLen)}${last}`;
}
