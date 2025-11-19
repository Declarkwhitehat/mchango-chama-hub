import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get auth token from request
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse URL and route
    const url = new URL(req.url);
    let pathParts = url.pathname.split('/').filter(p => p);
    
    // Remove function name from path if present
    if (pathParts[0] === 'chama-reports') {
      pathParts = pathParts.slice(1);
    }

    const [action, chamaId] = pathParts;
    const userId = url.searchParams.get('userId');

    // Route handlers
    if (action === 'info' && chamaId) {
      return await getChamaInfo(supabase, chamaId, userId);
    } else if (action === 'position' && chamaId) {
      return await getMemberPosition(supabase, chamaId, userId);
    } else if (action === 'contribution-history' && chamaId) {
      const period = parseInt(url.searchParams.get('period') || '30');
      return await getContributionHistory(supabase, chamaId, userId, period);
    } else if (action === 'summary' && chamaId) {
      const period = parseInt(url.searchParams.get('period') || '30');
      return await getChamaSummary(supabase, chamaId, period);
    } else if (action === 'generate-pdf' && req.method === 'POST') {
      const body = await req.json();
      return await generatePDF(supabase, body);
    }

    return new Response(
      JSON.stringify({ error: 'Invalid route' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in chama-reports:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function getChamaInfo(supabase: any, chamaId: string, userId: string | null) {
  // Verify user is member
  if (userId) {
    const { data: membership } = await supabase
      .from('chama_members')
      .select('id')
      .eq('chama_id', chamaId)
      .eq('user_id', userId)
      .eq('approval_status', 'approved')
      .single();

    if (!membership) {
      return new Response(
        JSON.stringify({ error: 'You are not a member of this chama' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  }

  // Fetch chama details
  const { data: chama, error: chamaError } = await supabase
    .from('chama')
    .select('name, contribution_frequency, every_n_days_count, group_code, status, max_members')
    .eq('id', chamaId)
    .single();

  if (chamaError || !chama) {
    return new Response(
      JSON.stringify({ error: 'Chama not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Fetch members
  const { data: members } = await supabase
    .from('chama_members')
    .select('member_code, order_index, user_id, profiles(full_name)')
    .eq('chama_id', chamaId)
    .eq('approval_status', 'approved')
    .eq('status', 'active')
    .order('order_index');

  const frequencyMap: Record<string, string> = {
    'daily': 'Daily',
    'weekly': 'Weekly',
    'monthly': 'Monthly',
    'every_n_days': `Every ${chama.every_n_days_count} days`
  };

  return new Response(
    JSON.stringify({
      chamaName: chama.name,
      memberCount: members?.length || 0,
      members: members?.map((m: any) => m.profiles?.full_name || 'Unknown') || [],
      frequency: frequencyMap[chama.contribution_frequency] || chama.contribution_frequency,
      groupCode: chama.group_code,
      status: chama.status
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function getMemberPosition(supabase: any, chamaId: string, userId: string | null) {
  if (!userId) {
    return new Response(
      JSON.stringify({ error: 'User ID required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Get user's member record
  const { data: userMember, error: memberError } = await supabase
    .from('chama_members')
    .select('id, order_index, member_code, user_id, profiles(full_name)')
    .eq('chama_id', chamaId)
    .eq('user_id', userId)
    .eq('approval_status', 'approved')
    .single();

  if (memberError || !userMember) {
    return new Response(
      JSON.stringify({ error: 'You are not a member of this chama' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Get all members in order
  const { data: allMembers } = await supabase
    .from('chama_members')
    .select('order_index, profiles(full_name)')
    .eq('chama_id', chamaId)
    .eq('approval_status', 'approved')
    .eq('status', 'active')
    .order('order_index');

  // Get next receiving cycle
  const { data: nextCycle } = await supabase
    .from('contribution_cycles')
    .select('end_date, cycle_number')
    .eq('chama_id', chamaId)
    .eq('beneficiary_member_id', userMember.id)
    .gte('end_date', new Date().toISOString())
    .order('end_date', { ascending: true })
    .limit(1)
    .single();

  return new Response(
    JSON.stringify({
      memberName: userMember.profiles?.full_name || 'Unknown',
      memberCode: userMember.member_code,
      position: userMember.order_index,
      totalMembers: allMembers?.length || 0,
      allMembersOrder: allMembers?.map((m: any) => m.profiles?.full_name || 'Unknown') || [],
      nextReceivingDate: nextCycle?.end_date || null,
      cycleNumber: nextCycle?.cycle_number || null
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function getContributionHistory(supabase: any, chamaId: string, userId: string | null, period: number) {
  if (!userId) {
    return new Response(
      JSON.stringify({ error: 'User ID required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Get member record
  const { data: member } = await supabase
    .from('chama_members')
    .select('id, balance_credit, balance_deficit, missed_payments_count, last_payment_date, profiles(full_name)')
    .eq('chama_id', chamaId)
    .eq('user_id', userId)
    .eq('approval_status', 'approved')
    .single();

  if (!member) {
    return new Response(
      JSON.stringify({ error: 'You are not a member of this chama' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Get recent cycles for the period
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - period);

  const { data: cycles } = await supabase
    .from('contribution_cycles')
    .select('id, start_date, end_date, cycle_number')
    .eq('chama_id', chamaId)
    .gte('start_date', startDate.toISOString())
    .order('start_date', { ascending: false });

  // Get payments for these cycles
  const cycleIds = cycles?.map((c: any) => c.id) || [];
  const { data: payments } = await supabase
    .from('member_cycle_payments')
    .select('cycle_id, amount_paid, is_paid, paid_at')
    .eq('member_id', member.id)
    .in('cycle_id', cycleIds);

  const contributions = cycles?.map((cycle: any) => {
    const payment = payments?.find((p: any) => p.cycle_id === cycle.id);
    return {
      date: cycle.end_date,
      cycleNumber: cycle.cycle_number,
      amount: payment?.amount_paid || 0,
      status: payment?.is_paid ? 'paid' : 'unpaid',
      paidAt: payment?.paid_at
    };
  }) || [];

  return new Response(
    JSON.stringify({
      memberName: member.profiles?.full_name || 'Unknown',
      totalContributions: contributions.filter((c: any) => c.status === 'paid').length,
      lastPaymentDate: member.last_payment_date,
      missedDays: member.missed_payments_count || 0,
      currentBalance: (member.balance_credit || 0) - (member.balance_deficit || 0),
      contributions
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function getChamaSummary(supabase: any, chamaId: string, period: number) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - period);

  // Get all cycles in period
  const { data: cycles } = await supabase
    .from('contribution_cycles')
    .select('id, due_amount')
    .eq('chama_id', chamaId)
    .gte('start_date', startDate.toISOString());

  const cycleIds = cycles?.map((c: any) => c.id) || [];

  // Get all payments in period
  const { data: payments } = await supabase
    .from('member_cycle_payments')
    .select('member_id, amount_paid, is_paid')
    .in('cycle_id', cycleIds);

  // Get all members
  const { data: members } = await supabase
    .from('chama_members')
    .select('id')
    .eq('chama_id', chamaId)
    .eq('approval_status', 'approved')
    .eq('status', 'active');

  const totalContributions = payments?.filter((p: any) => p.is_paid).length || 0;
  const totalAmount = payments?.reduce((sum: number, p: any) => sum + (p.amount_paid || 0), 0) || 0;

  // Calculate attendance
  const memberPaymentCounts = new Map();
  payments?.forEach((p: any) => {
    if (p.is_paid) {
      memberPaymentCounts.set(p.member_id, (memberPaymentCounts.get(p.member_id) || 0) + 1);
    }
  });

  const expectedPayments = cycles?.length || 0;
  const membersFullyPaid = Array.from(memberPaymentCounts.values()).filter((count: any) => count === expectedPayments).length;
  const membersPartiallyPaid = Array.from(memberPaymentCounts.values()).filter((count: any) => count > 0 && count < expectedPayments).length;
  const membersNotPaid = (members?.length || 0) - membersFullyPaid - membersPartiallyPaid;

  return new Response(
    JSON.stringify({
      totalContributions,
      totalAmount,
      periodContributions: totalContributions,
      periodAmount: totalAmount,
      attendanceSummary: {
        membersFullyPaid,
        membersPartiallyPaid,
        membersNotPaid
      }
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function generatePDF(supabase: any, body: any) {
  const { chamaId, userId, reportType } = body;
  
  if (!chamaId || !userId) {
    return new Response(
      JSON.stringify({ error: 'Chama ID and User ID required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Verify user is member
  const { data: membership } = await supabase
    .from('chama_members')
    .select('id')
    .eq('chama_id', chamaId)
    .eq('user_id', userId)
    .eq('approval_status', 'approved')
    .single();

  if (!membership) {
    return new Response(
      JSON.stringify({ error: 'You are not a member of this chama' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Map report type to days
  const daysMap: Record<string, number> = {
    'daily': 1,
    'weekly': 7,
    'monthly': 30
  };
  const days = daysMap[reportType] || 7;

  // Fetch chama and members data
  const { data: chama } = await supabase
    .from('chama')
    .select('name, contribution_amount, contribution_frequency')
    .eq('id', chamaId)
    .single();

  const { data: members } = await supabase
    .from('chama_members')
    .select('id, member_code, order_index, profiles(full_name)')
    .eq('chama_id', chamaId)
    .eq('approval_status', 'approved')
    .eq('status', 'active')
    .order('order_index');

  // Get cycles in period
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  const { data: cycles } = await supabase
    .from('contribution_cycles')
    .select('id, cycle_number, start_date, end_date')
    .eq('chama_id', chamaId)
    .gte('start_date', startDate.toISOString())
    .order('start_date');

  const cycleIds = cycles?.map((c: any) => c.id) || [];

  // Get all payments
  const { data: payments } = await supabase
    .from('member_cycle_payments')
    .select('member_id, cycle_id, is_paid')
    .in('cycle_id', cycleIds);

  // Build payment matrix
  const reportData = members?.map((member: any) => {
    const row: any = {
      name: member.profiles?.full_name || 'Unknown',
      code: member.member_code
    };

    let totalPaid = 0;
    cycles?.forEach((cycle: any, idx: number) => {
      const payment = payments?.find((p: any) => 
        p.member_id === member.id && p.cycle_id === cycle.id
      );
      const status = payment?.is_paid ? '✓' : '✗';
      row[`day${idx + 1}`] = status;
      if (status === '✓') totalPaid++;
    });

    row.total = `${totalPaid}/${cycles?.length || 0}`;
    return row;
  }) || [];

  // Generate simple text-based report (proper PDF would require jsPDF library setup in Deno)
  const reportContent = generateTextReport(chama, reportData, cycles, days);
  
  // Upload to storage
  const fileName = `chama-report-${chamaId}-${Date.now()}.txt`;
  const blob = new Blob([reportContent], { type: 'text/plain' });
  
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from('chama-reports')
    .upload(fileName, blob, {
      contentType: 'text/plain',
      cacheControl: '3600'
    });

  if (uploadError) {
    console.error('Upload error:', uploadError);
    return new Response(
      JSON.stringify({ error: 'Failed to upload report' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Get public URL
  const { data: publicUrlData } = supabase.storage
    .from('chama-reports')
    .getPublicUrl(fileName);

  const totalPaidCount = reportData.reduce((sum: number, row: any) => {
    return sum + (row.total.split('/')[0]);
  }, 0);

  return new Response(
    JSON.stringify({
      pdfUrl: publicUrlData.publicUrl,
      reportSummary: {
        totalDays: cycles?.length || 0,
        membersCount: members?.length || 0,
        totalContributions: totalPaidCount,
        attendanceRate: ((totalPaidCount / ((members?.length || 1) * (cycles?.length || 1))) * 100).toFixed(1)
      }
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

function generateTextReport(chama: any, reportData: any[], cycles: any[], days: number): string {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  let report = `${chama.name} - Contribution Report\n`;
  report += `Period: ${days} days (${startDate.toLocaleDateString()} - ${new Date().toLocaleDateString()})\n`;
  report += `Contribution Frequency: ${chama.contribution_frequency}\n`;
  report += `Amount per Contribution: KES ${chama.contribution_amount}\n\n`;
  
  report += `Member\tCode\t`;
  cycles?.forEach((_: any, idx: number) => {
    report += `Day ${idx + 1}\t`;
  });
  report += `Total\n`;
  report += `${'='.repeat(80)}\n`;
  
  reportData.forEach(row => {
    report += `${row.name}\t${row.code}\t`;
    cycles?.forEach((_: any, idx: number) => {
      report += `${row[`day${idx + 1}`]}\t`;
    });
    report += `${row.total}\n`;
  });
  
  return report;
}
