// Tool execution handlers for chat-support
// These handlers lookup user by ID/phone, then call chama-reports endpoints

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');

export async function handleGetChamaInfo(toolArgs: any, authHeader: string) {
  // Step 1: Lookup user and chama by member code with verification
  const lookupResponse = await fetch(
    `${SUPABASE_URL}/functions/v1/chama-reports/lookup-user?memberCode=${toolArgs.memberCode}&idNumber=${toolArgs.idNumber || ''}&phone=${toolArgs.phone || ''}`,
    { headers: { Authorization: authHeader } }
  );
  
  const lookupResult = await lookupResponse.json();
  
  if (!lookupResponse.ok || !lookupResult.userId || !lookupResult.chamaId) {
    return {
      error: true,
      message: lookupResult.error || 'Verification failed',
      suggestions: lookupResult.suggestions || []
    };
  }
  
  // Step 2: Use the userId and chamaId to fetch chama info
  const infoResponse = await fetch(
    `${SUPABASE_URL}/functions/v1/chama-reports/info/${lookupResult.chamaId}?userId=${lookupResult.userId}`,
    { headers: { Authorization: authHeader } }
  );
  
  const result = await infoResponse.json();
  result.userName = lookupResult.fullName;
  result.memberCode = lookupResult.memberCode;
  return result;
}

export async function handleGetManagerContact(toolArgs: any, authHeader: string) {
  // Lookup user and verify
  const lookupResponse = await fetch(
    `${SUPABASE_URL}/functions/v1/chama-reports/lookup-user?memberCode=${toolArgs.memberCode}&idNumber=${toolArgs.idNumber || ''}&phone=${toolArgs.phone || ''}`,
    { headers: { Authorization: authHeader } }
  );
  
  const lookupResult = await lookupResponse.json();
  if (!lookupResponse.ok || !lookupResult.userId || !lookupResult.chamaId) {
    return { error: true, message: lookupResult.error, suggestions: lookupResult.suggestions || [] };
  }
  
  // Get manager contact
  const managerResponse = await fetch(
    `${SUPABASE_URL}/functions/v1/chama-reports/manager-contact/${lookupResult.chamaId}?userId=${lookupResult.userId}`,
    { headers: { Authorization: authHeader } }
  );
  
  const result = await managerResponse.json();
  result.memberCode = lookupResult.memberCode;
  return result;
}

export async function handleGetMemberPosition(toolArgs: any, authHeader: string) {
  const lookupResponse = await fetch(
    `${SUPABASE_URL}/functions/v1/chama-reports/lookup-user?memberCode=${toolArgs.memberCode}&idNumber=${toolArgs.idNumber || ''}&phone=${toolArgs.phone || ''}`,
    { headers: { Authorization: authHeader } }
  );
  
  const lookupResult = await lookupResponse.json();
  if (!lookupResponse.ok || !lookupResult.userId || !lookupResult.chamaId) {
    return { error: true, message: lookupResult.error, suggestions: lookupResult.suggestions || [] };
  }
  
  const positionResponse = await fetch(
    `${SUPABASE_URL}/functions/v1/chama-reports/position/${lookupResult.chamaId}?userId=${lookupResult.userId}`,
    { headers: { Authorization: authHeader } }
  );
  
  const result = await positionResponse.json();
  result.userName = lookupResult.fullName;
  result.memberCode = lookupResult.memberCode;
  return result;
}

export async function handleGenerateReport(toolArgs: any, authHeader: string) {
  const lookupResponse = await fetch(
    `${SUPABASE_URL}/functions/v1/chama-reports/lookup-user?memberCode=${toolArgs.memberCode}&idNumber=${toolArgs.idNumber || ''}&phone=${toolArgs.phone || ''}`,
    { headers: { Authorization: authHeader } }
  );
  
  const lookupResult = await lookupResponse.json();
  if (!lookupResponse.ok || !lookupResult.userId || !lookupResult.chamaId) {
    return { error: true, message: lookupResult.error, suggestions: lookupResult.suggestions || [] };
  }
  
  const period = toolArgs.reportType === 'daily' ? 'daily' : toolArgs.reportType === 'weekly' ? '7day' : '30day';
  const reportResponse = await fetch(
    `${SUPABASE_URL}/functions/v1/chama-reports/generate-pdf/${lookupResult.chamaId}?userId=${lookupResult.userId}&period=${period}`,
    { headers: { Authorization: authHeader } }
  );
  
  const result = await reportResponse.json();
  result.userName = lookupResult.fullName;
  result.memberCode = lookupResult.memberCode;
  return result;
}

export async function handleGetMemberStats(toolArgs: any, authHeader: string) {
  const lookupResponse = await fetch(
    `${SUPABASE_URL}/functions/v1/chama-reports/lookup-user?memberCode=${toolArgs.memberCode}&idNumber=${toolArgs.idNumber || ''}&phone=${toolArgs.phone || ''}`,
    { headers: { Authorization: authHeader } }
  );
  
  const lookupResult = await lookupResponse.json();
  if (!lookupResponse.ok || !lookupResult.userId || !lookupResult.chamaId) {
    return { error: true, message: lookupResult.error, suggestions: lookupResult.suggestions || [] };
  }
  
  const statsResponse = await fetch(
    `${SUPABASE_URL}/functions/v1/chama-reports/contribution-history/${lookupResult.chamaId}?userId=${lookupResult.userId}`,
    { headers: { Authorization: authHeader } }
  );
  
  const result = await statsResponse.json();
  result.userName = lookupResult.fullName;
  result.memberCode = lookupResult.memberCode;
  return result;
}

export async function handleGetChamaSummary(toolArgs: any, authHeader: string) {
  // Lookup user and chama by member code
  const lookupResponse = await fetch(
    `${SUPABASE_URL}/functions/v1/chama-reports/lookup-user?memberCode=${toolArgs.memberCode}&idNumber=${toolArgs.idNumber || ''}&phone=${toolArgs.phone || ''}`,
    { headers: { Authorization: authHeader } }
  );
  
  const lookupResult = await lookupResponse.json();
  if (!lookupResponse.ok || !lookupResult.chamaId) {
    return { error: true, message: lookupResult.error, suggestions: lookupResult.suggestions || [] };
  }
  
  const period = toolArgs.period || 30;
  const summaryResponse = await fetch(
    `${SUPABASE_URL}/functions/v1/chama-reports/summary/${lookupResult.chamaId}?period=${period}`,
    { headers: { Authorization: authHeader } }
  );
  
  const result = await summaryResponse.json();
  result.memberCode = lookupResult.memberCode;
  return result;
}
