import { Loan } from "@prisma/client";
import { prisma } from "../db";
import { getMemberTotalSavings, checkLoanEligibility } from "./depositService";

const COMPANY_COMMISSION_RATE = 0.02; // 2%
const GROUP_PROFIT_RATE = 0.05; // 5%
const MAX_LOAN_POOL_PERCENTAGE = 0.3; // 30%
const MAX_LOAN_TO_SAVINGS_RATIO = 1.55; // 155%

// Helper function to get the available loan pool
export async function getAvailableLoanPool(savingGroupId: string): Promise<number> {
  const group = await prisma.savingGroup.findUnique({
    where: { id: savingGroupId },
    select: { totalSavings: true },
  });

  if (!group) {
    throw new Error("Saving Group not found.");
  }

  return group.totalSavings.toNumber() * MAX_LOAN_POOL_PERCENTAGE;
}

// Function to check if a loan request is valid
export async function checkLoanRequestValidity(
  savingGroupId: string,
  borrowerId: string,
  requestedAmount: number
): Promise<{ isValid: boolean; message: string }> {
  // 1. Check eligibility (saved >= 2000 for 2 consecutive months)
  const isEligible = await checkLoanEligibility(savingGroupId, borrowerId);
  if (!isEligible) {
    return {
      isValid: false,
      message:
        "Member is not eligible for a loan. Must have saved at least Ksh 2,000 for two consecutive months.",
    };
  }

  // 2. Check if the member has an active loan
  const activeLoan = await prisma.loan.findFirst({
    where: {
      borrowerId,
      is_active: true,
    },
  });
  if (activeLoan) {
    return {
      isValid: false,
      message: "Member already has an active loan.",
    };
  }

  // 3. Check loan pool availability (30% of total savings)
  const availablePool = await getAvailableLoanPool(savingGroupId);
  if (requestedAmount > availablePool) {
    return {
      isValid: false,
      message: `Requested amount (Ksh ${requestedAmount}) exceeds the available loan pool (Ksh ${availablePool}).`,
    };
  }

  // 4. Check loan-to-savings ratio (up to 155% of their savings)
  const memberSavings = await getMemberTotalSavings(savingGroupId, borrowerId);
  const maxLoanAmount = memberSavings * MAX_LOAN_TO_SAVINGS_RATIO;
  if (requestedAmount > maxLoanAmount) {
    return {
      isValid: false,
      message: `Requested amount (Ksh ${requestedAmount}) exceeds 155% of your total savings (Ksh ${maxLoanAmount}).`,
    };
  }

  return { isValid: true, message: "Loan request is valid." };
}

// Function to create a loan request (PENDING_APPROVAL)
export async function createLoanRequest(
  savingGroupId: string,
  borrowerId: string,
  requestedAmount: number
): Promise<Loan> {
  const { isValid, message } = await checkLoanRequestValidity(
    savingGroupId,
    borrowerId,
    requestedAmount
  );

  if (!isValid) {
    throw new Error(message);
  }

  // Calculate deductions
  const commissionDeducted = requestedAmount * COMPANY_COMMISSION_RATE;
  const profitDeducted = requestedAmount * GROUP_PROFIT_RATE;
  const totalDeductions = commissionDeducted + profitDeducted;
  const disbursedAmount = requestedAmount - totalDeductions;

  const loan = await prisma.loan.create({
    data: {
      savingGroupId,
      borrowerId,
      requestedAmount,
      principalAmount: requestedAmount,
      commissionDeducted,
      profitDeducted,
      disbursedAmount,
      status: "PENDING_APPROVAL",
      is_active: true,
    },
  });

  return loan;
}

// Function to get loan details
export async function getLoanDetails(loanId: string): Promise<Loan | null> {
  return prisma.loan.findUnique({
    where: { id: loanId },
  });
}

// Function to get all pending loans for a group
export async function getPendingLoans(savingGroupId: string): Promise<Loan[]> {
  return prisma.loan.findMany({
    where: {
      savingGroupId,
      status: "PENDING_APPROVAL",
    },
  });
}

// Function to approve and disburse a loan (after approval workflow is complete)
export async function disburseLoan(loanId: string): Promise<Loan> {
  // In a real application, this would also trigger the actual money transfer
  const loan = await prisma.loan.update({
    where: { id: loanId },
    data: {
      status: "DISBURSED",
    },
  });
  return loan;
}
