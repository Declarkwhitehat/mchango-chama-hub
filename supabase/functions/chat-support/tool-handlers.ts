// Tool execution handlers for chat-support
// These handlers lookup user by ID/phone, then call chama-reports endpoints

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');

export async function handleGetChamaInfo(toolArgs: any, authHeader: string) {
  // Step 1: Lookup user by ID number and phone
  const lookupResponse = await fetch(
    `${SUPABASE_URL}/functions/v1/chama-reports/lookup-user?idNumber=${toolArgs.idNumber}&phone=${toolArgs.phone}`,
    { headers: { Authorization: authHeader } }
  );
  
  const lookupResult = await lookupResponse.json();
  
  if (!lookupResponse.ok || !lookupResult.userId) {
    return {
      error: true,
      message: lookupResult.error || 'Could not find user with provided details',
      suggestions: lookupResult.suggestions || []
    };
  }
  
  // Step 2: Use the userId to fetch chama info
  const infoResponse = await fetch(
    `${SUPABASE_URL}/functions/v1/chama-reports/info/${toolArgs.chamaId}?userId=${lookupResult.userId}`,
    { headers: { Authorization: authHeader } }
  );
  
  const result = await infoResponse.json();
  result.userName = lookupResult.fullName;
  return result;
}

export async function handleGetMemberPosition(toolArgs: any, authHeader: string) {
  const lookupResponse = await fetch(
    `${SUPABASE_URL}/functions/v1/chama-reports/lookup-user?idNumber=${toolArgs.idNumber}&phone=${toolArgs.phone}`,
    { headers: { Authorization: authHeader } }
  );
  
  const lookupResult = await lookupResponse.json();
  if (!lookupResponse.ok || !lookupResult.userId) {
    return { error: true, message: lookupResult.error, suggestions: lookupResult.suggestions || [] };
  }
  
  const positionResponse = await fetch(
    `${SUPABASE_URL}/functions/v1/chama-reports/position/${toolArgs.chamaId}?userId=${lookupResult.userId}`,
    { headers: { Authorization: authHeader } }
  );
  
  const result = await positionResponse.json();
  result.userName = lookupResult.fullName;
  return result;
}

export async function handleGenerateReport(toolArgs: any, authHeader: string) {
  const lookupResponse = await fetch(
    `${SUPABASE_URL}/functions/v1/chama-reports/lookup-user?idNumber=${toolArgs.idNumber}&phone=${toolArgs.phone}`,
    { headers: { Authorization: authHeader } }
  );
  
  const lookupResult = await lookupResponse.json();
  if (!lookupResponse.ok || !lookupResult.userId) {
    return { error: true, message: lookupResult.error, suggestions: lookupResult.suggestions || [] };
  }
  
  const period = toolArgs.reportType === 'daily' ? 'daily' : toolArgs.reportType === 'weekly' ? '7day' : '30day';
  const reportResponse = await fetch(
    `${SUPABASE_URL}/functions/v1/chama-reports/generate-pdf/${toolArgs.chamaId}?userId=${lookupResult.userId}&period=${period}`,
    { headers: { Authorization: authHeader } }
  );
  
  const result = await reportResponse.json();
  result.userName = lookupResult.fullName;
  return result;
}

export async function handleGetMemberStats(toolArgs: any, authHeader: string) {
  const lookupResponse = await fetch(
    `${SUPABASE_URL}/functions/v1/chama-reports/lookup-user?idNumber=${toolArgs.idNumber}&phone=${toolArgs.phone}`,
    { headers: { Authorization: authHeader } }
  );
  
  const lookupResult = await lookupResponse.json();
  if (!lookupResponse.ok || !lookupResult.userId) {
    return { error: true, message: lookupResult.error, suggestions: lookupResult.suggestions || [] };
  }
  
  const statsResponse = await fetch(
    `${SUPABASE_URL}/functions/v1/chama-reports/contribution-history/${toolArgs.chamaId}?userId=${lookupResult.userId}`,
    { headers: { Authorization: authHeader } }
  );
  
  const result = await statsResponse.json();
  result.userName = lookupResult.fullName;
  return result;
}

export async function handleGetChamaSummary(toolArgs: any, authHeader: string) {
  // Optional: Lookup user if ID and phone provided
  if (toolArgs.idNumber && toolArgs.phone) {
    const lookupResponse = await fetch(
      `${SUPABASE_URL}/functions/v1/chama-reports/lookup-user?idNumber=${toolArgs.idNumber}&phone=${toolArgs.phone}`,
      { headers: { Authorization: authHeader } }
    );
    
    const lookupResult = await lookupResponse.json();
    if (!lookupResponse.ok || !lookupResult.userId) {
      return { error: true, message: lookupResult.error, suggestions: lookupResult.suggestions || [] };
    }
  }
  
  const period = toolArgs.period || 30;
  const summaryResponse = await fetch(
    `${SUPABASE_URL}/functions/v1/chama-reports/summary/${toolArgs.chamaId}?period=${period}`,
    { headers: { Authorization: authHeader } }
  );
  
  return await summaryResponse.json();
}
