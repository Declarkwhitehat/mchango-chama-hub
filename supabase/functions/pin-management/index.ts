import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Simple hash function using Web Crypto API
async function hashValue(value: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(value);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from auth header
    const authHeader = req.headers.get('Authorization');
    let userId: string | null = null;

    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user } } = await supabaseAdmin.auth.getUser(token);
      userId = user?.id || null;
    }

    const body = await req.json();
    const { action } = body;

    // Actions that require auth
    const authRequiredActions = ['set-pin', 'verify-pin', 'check-pin-status', 'reset-pin-security-questions', 'reset-pin-otp'];
    if (authRequiredActions.includes(action) && !userId) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    switch (action) {
      case 'set-pin': {
        const { pin, security_answers } = body;

        // Validate PIN format
        if (!pin || !/^\d{5}$/.test(pin)) {
          return new Response(
            JSON.stringify({ error: 'PIN must be exactly 5 digits' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Validate security answers (need exactly 3)
        if (!security_answers || !Array.isArray(security_answers) || security_answers.length !== 3) {
          return new Response(
            JSON.stringify({ error: 'Exactly 3 security questions and answers are required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Validate each answer has question_id and answer
        for (const sa of security_answers) {
          if (!sa.question_id || !sa.answer || sa.answer.trim().length < 2) {
            return new Response(
              JSON.stringify({ error: 'Each security answer must have a question_id and an answer (min 2 characters)' }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        }

        // Ensure unique questions
        const questionIds = security_answers.map((sa: any) => sa.question_id);
        if (new Set(questionIds).size !== 3) {
          return new Response(
            JSON.stringify({ error: 'You must choose 3 different security questions' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const pinHash = await hashValue(pin);

        // Upsert PIN
        const { error: pinError } = await supabaseAdmin
          .from('user_pins')
          .upsert({
            user_id: userId,
            pin_hash: pinHash,
            pin_set_at: new Date().toISOString(),
            failed_attempts: 0,
            locked_until: null,
          }, { onConflict: 'user_id' });

        if (pinError) {
          console.error('PIN set error:', pinError);
          return new Response(
            JSON.stringify({ error: 'Failed to set PIN' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Delete old security answers
        await supabaseAdmin
          .from('user_security_answers')
          .delete()
          .eq('user_id', userId);

        // Insert new security answers
        const answerRows = await Promise.all(
          security_answers.map(async (sa: any) => ({
            user_id: userId,
            question_id: sa.question_id,
            answer_hash: await hashValue(sa.answer.trim().toLowerCase()),
          }))
        );

        const { error: answerError } = await supabaseAdmin
          .from('user_security_answers')
          .insert(answerRows);

        if (answerError) {
          console.error('Security answers error:', answerError);
          return new Response(
            JSON.stringify({ error: 'Failed to save security answers' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, message: 'PIN and security questions set successfully' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'verify-pin': {
        const { pin } = body;

        if (!pin || !/^\d{5}$/.test(pin)) {
          return new Response(
            JSON.stringify({ error: 'PIN must be exactly 5 digits' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get user's PIN record
        const { data: pinRecord, error: fetchError } = await supabaseAdmin
          .from('user_pins')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle();

        if (fetchError || !pinRecord) {
          return new Response(
            JSON.stringify({ error: 'PIN not set up' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Check lockout
        if (pinRecord.locked_until && new Date(pinRecord.locked_until) > new Date()) {
          const remainingMs = new Date(pinRecord.locked_until).getTime() - Date.now();
          const remainingMin = Math.ceil(remainingMs / 60000);
          return new Response(
            JSON.stringify({ 
              error: `Account locked. Try again in ${remainingMin} minute(s).`,
              locked: true,
              locked_until: pinRecord.locked_until 
            }),
            { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const pinHash = await hashValue(pin);

        if (pinHash !== pinRecord.pin_hash) {
          const newAttempts = (pinRecord.failed_attempts || 0) + 1;
          const updateData: any = { failed_attempts: newAttempts };

          // Lock after 5 failed attempts for 15 minutes
          if (newAttempts >= 5) {
            updateData.locked_until = new Date(Date.now() + 15 * 60 * 1000).toISOString();
            updateData.failed_attempts = 0;
          }

          await supabaseAdmin
            .from('user_pins')
            .update(updateData)
            .eq('user_id', userId);

          return new Response(
            JSON.stringify({ 
              error: 'Incorrect PIN',
              remaining_attempts: Math.max(0, 5 - newAttempts),
              locked: newAttempts >= 5
            }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Reset failed attempts on success
        await supabaseAdmin
          .from('user_pins')
          .update({ failed_attempts: 0, locked_until: null })
          .eq('user_id', userId);

        return new Response(
          JSON.stringify({ success: true, verified: true }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'check-pin-status': {
        const { data: pinRecord } = await supabaseAdmin
          .from('user_pins')
          .select('pin_set_at, failed_attempts, locked_until')
          .eq('user_id', userId)
          .maybeSingle();

        return new Response(
          JSON.stringify({
            has_pin: !!pinRecord,
            locked: pinRecord?.locked_until ? new Date(pinRecord.locked_until) > new Date() : false,
            locked_until: pinRecord?.locked_until || null,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'get-security-questions': {
        // Public - just needs auth
        const { data: questions } = await supabaseAdmin
          .from('security_questions')
          .select('id, question_text')
          .order('question_text');

        return new Response(
          JSON.stringify({ questions: questions || [] }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'get-user-security-questions': {
        // Return question texts (not answers) for the user
        const { data: userAnswers } = await supabaseAdmin
          .from('user_security_answers')
          .select('question_id, security_questions(question_text)')
          .eq('user_id', userId);

        return new Response(
          JSON.stringify({ 
            questions: (userAnswers || []).map((ua: any) => ({
              question_id: ua.question_id,
              question_text: ua.security_questions?.question_text
            }))
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'reset-pin-security-questions': {
        const { answers, new_pin } = body;

        if (!new_pin || !/^\d{5}$/.test(new_pin)) {
          return new Response(
            JSON.stringify({ error: 'New PIN must be exactly 5 digits' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (!answers || !Array.isArray(answers) || answers.length !== 3) {
          return new Response(
            JSON.stringify({ error: 'All 3 security answers are required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Fetch stored answers
        const { data: storedAnswers } = await supabaseAdmin
          .from('user_security_answers')
          .select('question_id, answer_hash')
          .eq('user_id', userId);

        if (!storedAnswers || storedAnswers.length !== 3) {
          return new Response(
            JSON.stringify({ error: 'Security questions not set up' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Verify all answers
        let correctCount = 0;
        for (const answer of answers) {
          const answerHash = await hashValue(answer.answer.trim().toLowerCase());
          const stored = storedAnswers.find((sa: any) => sa.question_id === answer.question_id);
          if (stored && stored.answer_hash === answerHash) {
            correctCount++;
          }
        }

        if (correctCount < 3) {
          return new Response(
            JSON.stringify({ error: 'One or more security answers are incorrect', correct_count: correctCount }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Set new PIN
        const newPinHash = await hashValue(new_pin);
        await supabaseAdmin
          .from('user_pins')
          .update({ pin_hash: newPinHash, failed_attempts: 0, locked_until: null })
          .eq('user_id', userId);

        return new Response(
          JSON.stringify({ success: true, message: 'PIN reset successfully' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'reset-pin-otp': {
        const { new_pin } = body;

        if (!new_pin || !/^\d{5}$/.test(new_pin)) {
          return new Response(
            JSON.stringify({ error: 'New PIN must be exactly 5 digits' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // OTP has already been verified client-side via existing send-otp/verify-otp flow
        // This endpoint just sets the new PIN after OTP verification
        const newPinHash = await hashValue(new_pin);
        await supabaseAdmin
          .from('user_pins')
          .update({ pin_hash: newPinHash, failed_attempts: 0, locked_until: null })
          .eq('user_id', userId);

        return new Response(
          JSON.stringify({ success: true, message: 'PIN reset via OTP successfully' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: 'Invalid action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error) {
    console.error('PIN management error:', error);
    return new Response(
      JSON.stringify({ error: 'An error occurred' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
