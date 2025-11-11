import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PaymentMethod {
  id?: string;
  method_type: 'mpesa' | 'airtel_money' | 'bank_account';
  phone_number?: string;
  bank_name?: string;
  account_number?: string;
  account_name?: string;
  is_default?: boolean;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    const action = pathParts[pathParts.length - 1];

    // GET /list - Get user's payment methods
    if (req.method === 'GET' && action === 'list') {
      const { data: methods, error } = await supabase
        .from('payment_methods')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return new Response(JSON.stringify({ methods }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // POST /create - Add new payment method
    if (req.method === 'POST' && action === 'create') {
      const body: PaymentMethod = await req.json();

      // Check max 3 methods limit
      const { count } = await supabase
        .from('payment_methods')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);

      if (count && count >= 3) {
        return new Response(
          JSON.stringify({ error: 'Maximum 3 payment methods allowed' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Validate based on method type
      if (body.method_type === 'mpesa' || body.method_type === 'airtel_money') {
        if (!body.phone_number || !body.phone_number.match(/^\+254\d{9}$/)) {
          return new Response(
            JSON.stringify({ error: 'Invalid phone number format. Use +254XXXXXXXXX' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } else if (body.method_type === 'bank_account') {
        if (!body.bank_name || !body.account_number || !body.account_name) {
          return new Response(
            JSON.stringify({ error: 'Bank name, account number, and account name are required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      const { data: method, error } = await supabase
        .from('payment_methods')
        .insert({
          user_id: user.id,
          method_type: body.method_type,
          phone_number: body.phone_number,
          bank_name: body.bank_name,
          account_number: body.account_number,
          account_name: body.account_name,
          is_default: body.is_default || false,
        })
        .select()
        .single();

      if (error) throw error;

      // Mark payment details as completed if first method
      if (count === 0) {
        await supabase
          .from('profiles')
          .update({ payment_details_completed: true })
          .eq('id', user.id);
      }

      return new Response(JSON.stringify({ method }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // PUT /update/:id - Update payment method
    if (req.method === 'PUT' && pathParts.length >= 2) {
      const methodId = pathParts[pathParts.length - 1];
      const body: Partial<PaymentMethod> = await req.json();

      const { data: method, error } = await supabase
        .from('payment_methods')
        .update({
          phone_number: body.phone_number,
          bank_name: body.bank_name,
          account_number: body.account_number,
          account_name: body.account_name,
          is_default: body.is_default,
        })
        .eq('id', methodId)
        .eq('user_id', user.id)
        .select()
        .single();

      if (error) throw error;

      return new Response(JSON.stringify({ method }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // DELETE /delete/:id - Remove payment method
    if (req.method === 'DELETE' && pathParts.length >= 2) {
      const methodId = pathParts[pathParts.length - 1];

      const { error } = await supabase
        .from('payment_methods')
        .delete()
        .eq('id', methodId)
        .eq('user_id', user.id);

      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // POST /set-default/:id - Set default payment method
    if (req.method === 'POST' && action !== 'create' && pathParts.length >= 2) {
      const methodId = pathParts[pathParts.length - 1];

      // Set this one as default (trigger will unset others)
      const { data: method, error } = await supabase
        .from('payment_methods')
        .update({ is_default: true })
        .eq('id', methodId)
        .eq('user_id', user.id)
        .select()
        .single();

      if (error) throw error;

      return new Response(JSON.stringify({ method }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Invalid endpoint' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
