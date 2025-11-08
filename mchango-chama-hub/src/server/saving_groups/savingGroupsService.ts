import { createClient } from '@supabase/supabase-js';
import { Database } from '../../types/supabase'; // Assuming a standard Supabase type definition

// Initialize Supabase client (assuming environment variables are set up)
const supabase = createClient<Database>(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // Use service role key for backend operations
);

// --- Type Definitions (Simplified for implementation) ---
interface GroupCreationData {
  name: string;
  goal_kes: number;
  whatsapp_link?: string;
  description?: string;
  profile_picture_url?: string;
  admin_user_id: string;
}

interface DepositData {
  group_id: string;
  member_user_id: string;
  payer_user_id: string;
  amount_kes: number;
}

// --- Constants ---
const COMMISSION_RATE = 0.01; // 1%
const MIN_DEPOSIT_AMOUNT = 100; // KES 100
const LOAN_ELIGIBILITY_SAVINGS = 2000; // KES 2,000
const LOAN_POOL_RATIO = 0.30; // 30%
const LOAN_INTEREST_RATE = 6.5; // 6.5%
const INSURANCE_FEE_RATE = 2.0; // 2%

// --- Core Service Functions ---

/**
 * 1. Group Creation Logic
 * Creates a new saving group and adds the creator as the first member/admin.
 */
export async function createSavingGroup(data: GroupCreationData) {
  const { admin_user_id, ...groupData } = data;

  // 1. Create the Group
  const { data: group, error: groupError } = await supabase
    .from('saving_groups')
    .insert({
      ...groupData,
      admin_user_id,
      max_members: 100, // Fixed as per spec
    })
    .select()
    .single();

  if (groupError) throw new Error(`Failed to create group: ${groupError.message}`);

  // 2. Add the creator as a member
  const { error: memberError } = await supabase
    .from('group_members')
    .insert({
      group_id: group.id,
      user_id: admin_user_id,
    });

  if (memberError) throw new Error(`Failed to add admin as member: ${memberError.message}`);

  return group;
}

/**
 * 2. Saving/Deposit Logic
 * Handles a member's deposit, calculates commission, and updates group/member totals.
 */
export async function processDeposit(data: DepositData) {
  const { group_id, member_user_id, payer_user_id, amount_kes } = data;

  if (amount_kes < MIN_DEPOSIT_AMOUNT) {
    throw new Error(`Minimum deposit amount is KES ${MIN_DEPOSIT_AMOUNT}.`);
  }

  // Calculate commissions and net amount
  const commission_kes = amount_kes * COMMISSION_RATE;
  const net_amount_kes = amount_kes - commission_kes;

  // Start a database transaction for atomicity
  const { error: transactionError } = await supabase.rpc('process_deposit_transaction', {
    p_group_id: group_id,
    p_member_user_id: member_user_id,
    p_payer_user_id: payer_user_id,
    p_amount_kes: amount_kes,
    p_commission_kes: commission_kes,
    p_net_amount_kes: net_amount_kes,
  });

  if (transactionError) throw new Error(`Deposit transaction failed: ${transactionError.message}`);

  return {
    message: 'Deposit successful',
    net_savings: net_amount_kes,
    commission: commission_kes,
  };
}

/**
 * 3. Loan Request Logic
 * Checks eligibility and creates a pending loan request.
 */
export async function requestLoan(group_id: string, borrower_user_id: string, principal_amount_kes: number, due_date: string) {
  // 1. Check member eligibility (saved >= KES 2,000 and no active loan)
  const { data: member, error: memberError } = await supabase
    .from('group_members')
    .select('personal_savings_kes, has_active_loan')
    .eq('group_id', group_id)
    .eq('user_id', borrower_user_id)
    .single();

  if (memberError || !member) throw new Error('Member not found in group.');
  if (member.personal_savings_kes < LOAN_ELIGIBILITY_SAVINGS) {
    throw new Error(`Member must have saved at least KES ${LOAN_ELIGIBILITY_SAVINGS} to qualify for a loan.`);
  }
  if (member.has_active_loan) {
    throw new Error('Member already has an active loan.');
  }

  // 2. Check group loan pool limit
  const { data: group, error: groupError } = await supabase
    .from('saving_groups')
    .select('loan_pool_limit_kes')
    .eq('id', group_id)
    .single();

  if (groupError || !group) throw new Error('Group not found.');
  if (principal_amount_kes > group.loan_pool_limit_kes) {
    throw new Error(`Requested loan amount exceeds the group's current loan pool limit of KES ${group.loan_pool_limit_kes}.`);
  }

  // 3. Calculate repayment amount
  const interest_amount = principal_amount_kes * (LOAN_INTEREST_RATE / 100);
  const total_repayment_kes = principal_amount_kes + interest_amount;

  // 4. Create the loan request
  const { data: loan, error: loanError } = await supabase
    .from('group_loans')
    .insert({
      group_id,
      borrower_user_id,
      principal_amount_kes,
      total_repayment_kes,
      due_date,
      balance_kes: total_repayment_kes,
      status: 'PENDING_APPROVAL',
    })
    .select()
    .single();

  if (loanError) throw new Error(`Failed to create loan request: ${loanError.message}`);

  return loan;
}

/**
 * 4. Loan Approval Logic
 * Approves a loan request by a guarantor. Requires a minimum of 3 approvals.
 */
export async function approveLoan(loan_id: string, guarantor_user_id: string) {
  // 1. Check if the guarantor has an active loan
  const { data: activeLoan, error: loanCheckError } = await supabase
    .from('group_loans')
    .select('id')
    .eq('borrower_user_id', guarantor_user_id)
    .eq('status', 'ACTIVE')
    .maybeSingle();

  if (loanCheckError) throw new Error('Error checking guarantor active loan status.');
  if (activeLoan) throw new Error('Guarantor cannot approve a loan while having an active loan.');

  // 2. Record the approval
  const { error: guarantorError } = await supabase
    .from('loan_guarantors')
    .insert({
      loan_id,
      guarantor_user_id,
      approved_at: new Date().toISOString(),
    });

  if (guarantorError) throw new Error(`Failed to record approval: ${guarantorError.message}`);

  // 3. Check for 3 approvals to finalize the loan
  const { count: approvalCount, error: countError } = await supabase
    .from('loan_guarantors')
    .select('*', { count: 'exact' })
    .eq('loan_id', loan_id);

  if (countError) throw new Error('Error counting approvals.');

  if (approvalCount && approvalCount >= 3) {
    // Finalize the loan
    const { data: loan, error: updateError } = await supabase
      .from('group_loans')
      .update({ status: 'ACTIVE', approved_at: new Date().toISOString() })
      .eq('id', loan_id)
      .select('group_id, borrower_user_id, principal_amount_kes')
      .single();

    if (updateError) throw new Error(`Failed to activate loan: ${updateError.message}`);

    // Update borrower's has_active_loan status
    await supabase
      .from('group_members')
      .update({ has_active_loan: true })
      .eq('user_id', loan.borrower_user_id)
      .eq('group_id', loan.group_id);

    // TODO: Add notification for loan activation
    return { message: 'Loan approved and activated.', loan };
  }

  return { message: `Approval recorded. ${3 - approvalCount} more approvals needed.` };
}

/**
 * 5. Loan Repayment Logic
 * Processes a loan repayment, updates loan balance, and group profits.
 */
export async function processLoanRepayment(loan_id: string, amount_kes: number) {
  // This should be an atomic database function (PL/pgSQL) for reliability
  const { error: transactionError } = await supabase.rpc('process_loan_repayment_transaction', {
    p_loan_id: loan_id,
    p_repayment_amount: amount_kes,
  });

  if (transactionError) throw new Error(`Loan repayment transaction failed: ${transactionError.message}`);

  return { message: 'Loan repayment successful.' };
}

/**
 * 6. Loan Default Logic
 * Handles a loan default, splits the balance among guarantors, and updates group profits.
 */
export async function processLoanDefault(loan_id: string) {
  // This should be an atomic database function (PL/pgSQL) for reliability
  const { error: transactionError } = await supabase.rpc('process_loan_default_transaction', {
    p_loan_id: loan_id,
  });

  if (transactionError) throw new Error(`Loan default transaction failed: ${transactionError.message}`);

  return { message: 'Loan default processed. Balance split among guarantors.' };
}

/**
 * 7. Profit Distribution Logic
 * Distributes accumulated group profits to eligible members based on their savings ratio.
 */
export async function distributeProfits(group_id: string) {
  // This should be an atomic database function (PL/pgSQL) for reliability
  const { error: transactionError } = await supabase.rpc('distribute_group_profits', {
    p_group_id: group_id,
  });

  if (transactionError) throw new Error(`Profit distribution failed: ${transactionError.message}`);

  return { message: 'Profits successfully distributed to eligible members.' };
}
