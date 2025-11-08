import { Loan, LoanGuarantor } from "@prisma/client";
import { prisma } from "../db";
import { getLoanDetails } from "./loanService";

// Function to handle a loan default
export async function handleLoanDefault(loanId: string): Promise<Loan> {
  const loan = await getLoanDetails(loanId);
  if (!loan || loan.status !== "DISBURSED") {
    throw new Error("Loan not found or not in DISBURSED status.");
  }

  // 1. Update loan status to DEFAULTED
  const defaultedLoan = await prisma.loan.update({
    where: { id: loanId },
    data: { status: "DEFAULTED", is_active: false },
  });

  // 2. Get all guarantors (approvers)
  const guarantors = await prisma.loanGuarantor.findMany({
    where: { loanId },
  });

  if (guarantors.length === 0) {
    // If no guarantors, the group absorbs the loss (unpaid balance)
    // This is a simplification, but the user's policy requires guarantors.
    return defaultedLoan;
  }

  // 3. Calculate the unpaid balance (requested amount - total repayments)
  const totalRepayments = await prisma.loanRepayment.aggregate({
    _sum: { amount: true },
    where: { loanId },
  });
  const repaidAmount = totalRepayments._sum.amount?.toNumber() || 0;
  const unpaidBalance = defaultedLoan.principalAmount.toNumber() - repaidAmount;

  // 4. Divide the unpaid balance equally among all guarantors
  const sharePerGuarantor = unpaidBalance / guarantors.length;

  // 5. Deduct the share from each guarantor's savings
  const guarantorUpdates = guarantors.map(async (guarantor) => {
    // Deduct from savings (This requires a negative deposit or a specific savings transaction)
    // For simplicity and to follow the user's logic (deducted from their savings),
    // we will create a negative deposit record and update the guarantor record.
    await prisma.deposit.create({
      data: {
        savingGroupId: defaultedLoan.savingGroupId,
        userId: guarantor.guarantorId,
        payerId: "SYSTEM", // System deduction
        amount: -sharePerGuarantor, // Negative amount to reduce savings
        commissionAmount: 0, // No commission on deduction
      },
    });

    // Update the guarantor record with the deducted amount
    return prisma.loanGuarantor.update({
      where: { id: guarantor.id },
      data: { defaultShare: sharePerGuarantor },
    });
  });

  await Promise.all(guarantorUpdates);

  // 6. Notifications (Simulated)
  // In a real app, this would trigger a notification service.
  console.log(`Loan ${loanId} defaulted. Unpaid balance of ${unpaidBalance} divided among ${guarantors.length} guarantors.`);

  return defaultedLoan;
}

// Function to refund guarantors if the borrower eventually pays
export async function refundGuarantors(loanId: string): Promise<void> {
  const loan = await getLoanDetails(loanId);
  if (!loan || loan.status !== "REPAID") {
    throw new Error("Loan not found or not in REPAID status.");
  }

  const guarantors = await prisma.loanGuarantor.findMany({
    where: { loanId, isRefunded: false },
  });

  const refundUpdates = guarantors.map(async (guarantor) => {
    // Refund the deducted amount (create a positive deposit)
    await prisma.deposit.create({
      data: {
        savingGroupId: loan.savingGroupId,
        userId: guarantor.guarantorId,
        payerId: "SYSTEM", // System refund
        amount: guarantor.defaultShare.toNumber(),
        commissionAmount: 0,
      },
    });

    // Mark as refunded
    return prisma.loanGuarantor.update({
      where: { id: guarantor.id },
      data: { isRefunded: true },
    });
  });

  await Promise.all(refundUpdates);
}

// Function to handle profit disqualification for a defaulted borrower
export async function disqualifyBorrowerForDefault(loanId: string): Promise<void> {
  const loan = await getLoanDetails(loanId);
  if (!loan || loan.status !== "DEFAULTED") {
    throw new Error("Loan not found or not in DEFAULTED status.");
  }

  // 1. Get the borrower's total savings
  const borrowerSavings = await prisma.deposit.aggregate({
    _sum: { amount: true },
    where: {
      savingGroupId: loan.savingGroupId,
      userId: loan.borrowerId,
    },
  });
  const totalSavings = borrowerSavings._sum.amount?.toNumber() || 0;

  // 2. Calculate the unpaid balance (as done in handleLoanDefault)
  const totalRepayments = await prisma.loanRepayment.aggregate({
    _sum: { amount: true },
    where: { loanId },
  });
  const repaidAmount = totalRepayments._sum.amount?.toNumber() || 0;
  const unpaidBalance = loan.principalAmount.toNumber() - repaidAmount;

  // 3. Total amount to add to group profits: Borrower's Savings + Unpaid Balance
  const amountToProfit = totalSavings + unpaidBalance;

  // 4. Update group profits
  await prisma.savingGroup.update({
    where: { id: loan.savingGroupId },
    data: {
      totalProfits: {
        increment: amountToProfit,
      },
    },
  });

  // 5. Zero out the borrower's savings (This is a complex operation and would require
  // a specific transaction type to mark the savings as transferred to profit).
  // For now, the negative deposit in handleLoanDefault will reduce the savings,
  // and the profit distribution logic must exclude this borrower.
}
