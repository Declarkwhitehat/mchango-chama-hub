// Safaricom official M-Pesa callback IP ranges.
// Used by payment-stk-callback and b2c-callback to reject spoofed callbacks.
const SAFARICOM_CIDR_RANGES: ReadonlyArray<readonly [string, number]> = [
  // Official Safaricom Daraja callback ranges (per Safaricom documentation)
  ['196.201.214.0', 24],
  ['196.201.216.0', 24],
  ['196.201.213.0', 24],
  ['196.201.212.0', 24],
  ['196.201.217.0', 24],
  ['196.201.215.0', 24],
];

/** Convert dotted-quad IPv4 → 32-bit unsigned integer, or null if invalid. */
function ipv4ToInt(ip: string): number | null {
  const parts = ip.trim().split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (p === '' || /\D/.test(p)) return null;
    const o = Number(p);
    if (!Number.isInteger(o) || o < 0 || o > 255) return null;
    n = (n * 256) + o;
  }
  return n >>> 0;
}

function inCidr(ip: string, network: string, prefix: number): boolean {
  const ipInt = ipv4ToInt(ip);
  const netInt = ipv4ToInt(network);
  if (ipInt === null || netInt === null) return false;
  if (prefix === 0) return true;
  const mask = prefix === 32 ? 0xffffffff : (~((1 << (32 - prefix)) - 1)) >>> 0;
  return (ipInt & mask) === (netInt & mask);
}

/**
 * Extract client IP from request headers in priority order:
 * x-forwarded-for (first hop) → x-real-ip → cf-connecting-ip → 'unknown'.
 */
export function getCallbackClientIP(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  const xri = req.headers.get('x-real-ip');
  if (xri) return xri.trim();
  const cf = req.headers.get('cf-connecting-ip');
  if (cf) return cf.trim();
  return 'unknown';
}

/**
 * True if the IP belongs to a Safaricom callback range OR matches the
 * MPESA_CALLBACK_BYPASS_IPS env var (comma-separated allow-list for testing).
 */
export function isSafaricomCallbackIP(ip: string): boolean {
  if (!ip || ip === 'unknown') return false;

  for (const [net, prefix] of SAFARICOM_CIDR_RANGES) {
    if (inCidr(ip, net, prefix)) return true;
  }

  const bypass = (Deno.env.get('MPESA_CALLBACK_BYPASS_IPS') || '').trim();
  if (bypass) {
    const allow = bypass.split(',').map((s) => s.trim()).filter(Boolean);
    if (allow.includes(ip)) return true;
  }

  return false;
}
