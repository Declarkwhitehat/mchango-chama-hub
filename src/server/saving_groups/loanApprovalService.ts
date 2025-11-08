import { LoanApproval } from "@prisma/client";
import { prisma } from "../db";
import { getLoanDetails, disburseLoan } from "./loanService";
import { checkLoanEligibility } from "./depositService";

// Helper to get the total number of eligible approvers in a group
export async function getEligibleApproverCount(savingGroupId: string): Promise<number> {
  // 1. Get all members of the group
  const members = await prisma.savingGroupMember.findMany({
    where: { savingGroupId },
    select: { userId: true },
  });

  let eligibleCount = 0;
  for (const member of members) {
    // 2. Check if member has an active loan
    const activeLoan = await prisma.loan.findFirst({
      where: { borrowerId: member.userId, is_active: true },
    });
    if (activeLoan) continue;

    // 3. Check if member meets savings eligibility (saved >= 2000 for 2 consecutive months)
    const isEligible = await checkLoanEligibility(savingGroupId, member.userId);
    if (isEligible) {
      eligibleCount++;
    }
  }
  return eligibleCount;
}

// Helper to get the total number of members in a group
export async function getTotalMemberCount(savingGroupId: string): Promise<number> {
  return prisma.savingGroupMember.count({
    where: { savingGroupId },
  });
}

// Function to check if a user can approve a loan
export async function canApproveLoan(
  savingGroupId: string,
  userId: string
): Promise<boolean> {
  // Must not have an active loan
  const activeLoan = await prisma.loan.findFirst({
    where: { borrowerId: userId, is_active: true },
  });
  if (activeLoan) return false;

  // Must meet savings eligibility
  return checkLoanEligibility(savingGroupId, userId);
}

// Function to record a loan approval
export async function recordLoanApproval(
  loanId: string,
  approverId: string
): Promise<LoanApproval> {
  const loan = await getLoanDetails(loanId);
  if (!loan) {
    throw new Error("Loan not found.");
  }

  // Check if the approver is eligible
  const isEligible = await canApproveLoan(loan.savingGroupId, approverId);
  if (!isEligible) {
    throw new Error("User is not eligible to approve this loan.");
  }

  // Check if already approved
  const existingApproval = await prisma.loanApproval.findUnique({
    where: { loanId_approverId: { loanId, approverId } },
  });
  if (existingApproval) {
    throw new Error("Loan already approved by this user.");
  }

  // Record the approval
  const approval = await prisma.loanApproval.create({
    data: { loanId, approverId },
  });

  // Check for full approval after recording
  await checkAndFinalizeLoanApproval(loanId);

  return approval;
}

// Function to check if approval criteria are met and finalize the loan
export async function checkAndFinalizeLoanApproval(loanId: string): Promise<void> {
  const loan = await getLoanDetails(loanId);
  if (!loan || loan.status !== "PENDING_APPROVAL") return;

  const savingGroup = await prisma.savingGroup.findUnique({
    where: { id: loan.savingGroupId },
    select: { managerId: true },
  });
  if (!savingGroup) return;

  const totalMembers = await getTotalMemberCount(loan.savingGroupId);
  const eligibleApprovers = await getEligibleApproverCount(loan.savingGroupId);
  const currentApprovals = await prisma.loanApproval.count({
    where: { loanId },
  });

  // Get the manager's approval status
  const managerApproved = await prisma.loanApproval.findFirst({
    where: { loanId, approverId: savingGroup.managerId },
  });

  // Get non-manager approvals
  const nonManagerApprovals = await prisma.loanApproval.count({
    where: { loanId, NOT: { approverId: savingGroup.managerId } },
  });

  // Calculate required approvals
  const requiredMemberApprovalCount = Math.ceil(eligibleApprovers * 0.4); // 40% of eligible members

  // Check Approval Rule 1: Manager + 40% of members
  const rule1Met =
    managerApproved && nonManagerApprovals >= requiredMemberApprovalCount;

  // Check Approval Rule 2: 70% of members total
  const requiredTotalApprovalCount = Math.ceil(totalMembers * 0.7);
  const rule2Met = currentApprovals >= requiredTotalApprovalCount;

  if (rule1Met || rule2Met) {
    // Finalize the loan
    await disburseLoan(loanId);

    // Record all approvers as guarantors
    const approvers = await prisma.loanApproval.findMany({
      where: { loanId },
      select: { approverId: true },
    });

    const guarantorData = approvers.map((a) => ({
      loanId,
      guarantorId: a.approverId,
      defaultShare: 0, // Will be calculated on default
    }));

    await prisma.loanGuarantor.createMany({
      data: guarantorData,
      skipDuplicates: true,
    });
  }
}
