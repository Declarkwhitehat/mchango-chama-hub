// Canonical SMS sender for edge functions.
// Always routes through the `send-transactional-sms` function, which holds the
// working Onfon credentials, sanitization and delivery logging.
export async function sendSms(
  phone: string,
  message: string,
  eventType = 'transactional'
): Promise<{ success: boolean; error?: string }> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!phone || !message) return { success: false, error: 'missing phone or message' };
  if (!supabaseUrl || !serviceKey) return { success: false, error: 'supabase env not configured' };

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/send-transactional-sms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
        'apikey': serviceKey,
      },
      body: JSON.stringify({ phone, message, eventType }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || (data as any)?.success === false) {
      const err = (data as any)?.error || `SMS gateway returned ${res.status}`;
      console.error('sendSms failed:', err);
      return { success: false, error: String(err) };
    }
    return { success: true };
  } catch (error) {
    console.error('sendSms error:', (error as Error).message);
    return { success: false, error: (error as Error).message };
  }
}
