import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

interface RateLimitResult {
  allowed: boolean;
  remainingAttempts: number;
  resetTime?: Date;
  error?: string;
}

export async function checkRateLimit(
  supabase: SupabaseClient,
  identifier: string,
  identifierType: 'ip' | 'phone' | 'email',
  action: string,
  windowMs: number = 4 * 60 * 60 * 1000, // Default: 4 hours
  maxAttempts: number = 3 // Default: 3 attempts
): Promise<RateLimitResult> {
  try {
    // First, clean up old rate limit records
    await supabase.rpc('cleanup_old_rate_limits');

    // Check existing rate limit record
    const { data: existingRecord, error: fetchError } = await supabase
      .from('rate_limit_attempts')
      .select('*')
      .eq('identifier', identifier)
      .eq('identifier_type', identifierType)
      .eq('action', action)
      .maybeSingle();

    if (fetchError) {
      console.error('Rate limit fetch error:', fetchError);
      // On error, allow the request but log it
      return { allowed: true, remainingAttempts: maxAttempts };
    }

    const now = new Date();

    if (!existingRecord) {
      // No record exists, create new one
      const { error: insertError } = await supabase
        .from('rate_limit_attempts')
        .insert({
          identifier,
          identifier_type: identifierType,
          action,
          attempts: 1,
          window_start: now.toISOString(),
        });

      if (insertError) {
        console.error('Rate limit insert error:', insertError);
      }

      return {
        allowed: true,
        remainingAttempts: maxAttempts - 1,
      };
    }

    // Check if window has expired
    const windowStart = new Date(existingRecord.window_start);
    const timeSinceWindowStart = now.getTime() - windowStart.getTime();

    if (timeSinceWindowStart > windowMs) {
      // Window expired, reset the counter
      const { error: updateError } = await supabase
        .from('rate_limit_attempts')
        .update({
          attempts: 1,
          window_start: now.toISOString(),
          updated_at: now.toISOString(),
        })
        .eq('id', existingRecord.id);

      if (updateError) {
        console.error('Rate limit reset error:', updateError);
      }

      return {
        allowed: true,
        remainingAttempts: maxAttempts - 1,
      };
    }

    // Window is still active, check attempts
    if (existingRecord.attempts >= maxAttempts) {
      const resetTime = new Date(windowStart.getTime() + windowMs);
      const minutesUntilReset = Math.ceil((resetTime.getTime() - now.getTime()) / (60 * 1000));
      
      return {
        allowed: false,
        remainingAttempts: 0,
        resetTime,
        error: `Too many attempts. Please try again in ${minutesUntilReset} minutes.`,
      };
    }

    // Increment attempts
    const newAttempts = existingRecord.attempts + 1;
    const { error: updateError } = await supabase
      .from('rate_limit_attempts')
      .update({
        attempts: newAttempts,
        updated_at: now.toISOString(),
      })
      .eq('id', existingRecord.id);

    if (updateError) {
      console.error('Rate limit increment error:', updateError);
    }

    return {
      allowed: true,
      remainingAttempts: maxAttempts - newAttempts,
    };
  } catch (error) {
    console.error('Rate limit check error:', error);
    // On unexpected error, allow the request
    return { allowed: true, remainingAttempts: maxAttempts };
  }
}

export function getClientIP(req: Request): string {
  // Try to get real IP from headers (Cloudflare, proxies, etc.)
  const cfConnectingIp = req.headers.get('cf-connecting-ip');
  const xForwardedFor = req.headers.get('x-forwarded-for');
  const xRealIp = req.headers.get('x-real-ip');

  if (cfConnectingIp) return cfConnectingIp;
  if (xForwardedFor) return xForwardedFor.split(',')[0].trim();
  if (xRealIp) return xRealIp;

  // Fallback
  return 'unknown';
}
