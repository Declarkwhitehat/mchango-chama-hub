import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
};

function extractConversationId(notes?: string | null): string | null {
  if (!notes) return null;

  const convMatch = notes.match(/ConvID=([^,\s]+)/);
  if (convMatch?.[1]) return convMatch[1];

  const agMatch = notes.match(/AG_[A-Za-z0-9_]+/);
  if (agMatch?.[0]) return agMatch[0];

  return null;
}

async function getMpesaAccessToken(): Promise<string> {
  const consumerKey = Deno.env.get('MPESA_CONSUMER_KEY') ?? '';
  const consumerSecret = Deno.env.get('MPESA_CONSUMER_SECRET') ?? '';
  const auth = btoa(`${consumerKey}:${consumerSecret}`);

  const response = await fetch(
    'https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
    { headers: { Authorization: `Basic ${auth}` } }
  );

  const data = await response.json();
  if (!data?.access_token) throw new Error('Failed to get M-Pesa access token');
  return data.access_token;
}

async function sendTransactionStatusQuery(params: {
  accessToken: string;
  supabaseUrl: string;
  conversationId: string;
  withdrawalId: string;
}) {
  const shortcode = Deno.env.get('MPESA_SHORTCODE') ?? '';
  const initiatorName = Deno.env.get('MPESA_B2C_INITIATOR_NAME') ?? '';
  const securityCredential = Deno.env.get('MPESA_B2C_SECURITY_CREDENTIAL') ?? '';

  const statusPayload = {
    Initiator: initiatorName,
    SecurityCredential: securityCredential,
    CommandID: 'TransactionStatusQuery',
    TransactionID: params.conversationId,
    PartyA: shortcode,
    IdentifierType: '4',
    ResultURL: `${params.supabaseUrl}/functions/v1/b2c-callback`,
    QueueTimeOutURL: `${params.supabaseUrl}/functions/v1/b2c-callback`,
    Remarks: `Status check for WD-${params.withdrawalId.substring(0, 8)}`,
    Occasion: `WD-${params.withdrawalId}`,
  };

  const statusResponse = await fetch(
    'https://api.safaricom.co.ke/mpesa/transactionstatus/v1/query',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${params.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(statusPayload),
    }
  );

  const statusResult = await statusResponse.json();
  return { ok: statusResponse.ok, result: statusResult };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '').trim();
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const body = await req.json();

    const isServiceRequest = token === serviceRoleKey;
    let requesterUserId: string | null = null;
    let isAdminUser = false;

    if (!isServiceRequest) {
      const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
      if (userError || !userData?.user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      requesterUserId = userData.user.id;

      const { data: roleRow } = await supabaseAdmin
        .from('user_roles')
        .select('role')
        .eq('user_id', requesterUserId)
        .eq('role', 'admin')
        .maybeSingle();

      isAdminUser = !!roleRow;
    }

    // Bulk reconciliation mode (service role or admin only)
    if (body?.reconcile_all_processing === true) {
      if (!isServiceRequest && !isAdminUser) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const maxRecords = Math.min(Number(body.max_records || 200), 1000);
      const staleFailureThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const { data: processingWithdrawals, error: listError } = await supabaseAdmin
        .from('withdrawals')
        .select('id, status, notes, b2c_attempt_count, last_b2c_attempt_at, created_at')
        .eq('status', 'processing')
        .order('created_at', { ascending: true })
        .limit(maxRecords);

      if (listError) {
        return new Response(JSON.stringify({ error: listError.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const accessToken = await getMpesaAccessToken();
      let reconciled = 0;
      let failedQueries = 0;
      let autoFailed = 0;
      let skippedNoConversation = 0;

      for (const wd of processingWithdrawals || []) {
        const conversationId = extractConversationId(wd.notes);

        if (!conversationId) {
          const isVeryOld = (wd.last_b2c_attempt_at || wd.created_at) < staleFailureThreshold;
          if (isVeryOld) {
            await supabaseAdmin
              .from('withdrawals')
              .update({
                status: 'failed',
                b2c_error_details: {
                  reconciliation_failed: true,
                  reason: 'No ConversationID found for stale processing withdrawal',
                },
                notes: (wd.notes || '') + `\n[SYSTEM] Auto-failed by reconciliation: missing ConversationID at ${new Date().toISOString()}`,
              })
              .eq('id', wd.id)
              .eq('status', 'processing');
            autoFailed += 1;
          } else {
            skippedNoConversation += 1;
          }
          continue;
        }

        const queryResp = await sendTransactionStatusQuery({
          accessToken,
          supabaseUrl,
          conversationId,
          withdrawalId: wd.id,
        });

        if (!queryResp.ok) {
          failedQueries += 1;
        } else {
          reconciled += 1;
        }

        await supabaseAdmin
          .from('withdrawals')
          .update({
            notes: (wd.notes || '') + `\n[SYSTEM] Reconcile query at ${new Date().toISOString()} for ConvID=${conversationId}: ${JSON.stringify(queryResp.result).substring(0, 250)}`,
          })
          .eq('id', wd.id);
      }

      return new Response(JSON.stringify({
        success: true,
        total_processing: processingWithdrawals?.length || 0,
        reconciled,
        failed_queries: failedQueries,
        auto_failed: autoFailed,
        skipped_no_conversation: skippedNoConversation,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { withdrawal_id } = body;
    if (!withdrawal_id) {
      return new Response(JSON.stringify({ error: 'withdrawal_id is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: withdrawal, error: wdError } = await supabaseAdmin
      .from('withdrawals')
      .select('id, requested_by, status, notes')
      .eq('id', withdrawal_id)
      .single();

    if (wdError || !withdrawal) {
      return new Response(JSON.stringify({ error: 'Withdrawal not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!isServiceRequest && !isAdminUser && withdrawal.requested_by !== requesterUserId) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (withdrawal.status === 'completed' || withdrawal.status === 'failed') {
      return new Response(JSON.stringify({
        status: withdrawal.status,
        message: `Withdrawal is already ${withdrawal.status}`,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (withdrawal.status !== 'processing') {
      return new Response(JSON.stringify({
        status: withdrawal.status,
        message: 'Withdrawal is not in processing state',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const conversationId = extractConversationId(withdrawal.notes);
    if (!conversationId) {
      return new Response(JSON.stringify({
        error: 'No ConversationID found for this withdrawal — cannot query Safaricom',
        status: withdrawal.status,
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const accessToken = await getMpesaAccessToken();
    const queryResp = await sendTransactionStatusQuery({
      accessToken,
      supabaseUrl,
      conversationId,
      withdrawalId: withdrawal_id,
    });

    await supabaseAdmin
      .from('withdrawals')
      .update({
        notes: (withdrawal.notes || '') + `\n[SYSTEM] Status query at ${new Date().toISOString()} for ConvID=${conversationId}: ${JSON.stringify(queryResp.result).substring(0, 250)}`,
      })
      .eq('id', withdrawal_id);

    return new Response(JSON.stringify({
      status: withdrawal.status,
      safaricom_response: queryResp.result,
      message: 'Status query sent. The result will arrive via callback and update the withdrawal automatically.',
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
    console.error('Error in b2c-status-query:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
