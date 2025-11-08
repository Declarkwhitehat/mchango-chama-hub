import { Deposit } from "@prisma/client";
import { prisma } from "../db";

const COMMISSION_RATE = 0.01; // 1%

export async function createDeposit(
  savingGroupId: string,
  userId: string,
  payerId: string,
  amount: number
): Promise<Deposit> {
  if (amount < 100) {
    throw new Error("Minimum deposit amount is Ksh 100.");
  }

  const commissionAmount = amount * COMMISSION_RATE;
  const netAmount = amount - commissionAmount;

  // 1. Create the deposit record
  const deposit = await prisma.deposit.create({
    data: {
      savingGroupId,
      userId,
      payerId,
      amount,
      commissionAmount,
    },
  });

  // 2. Update the group's total savings (This is also handled by a trigger in the SQL migration, but good to have service logic)
  // Since the SQL trigger is more reliable for atomicity, we will rely on that for the total_savings update.

  // 3. Record the commission for the company (This would typically go to a separate ledger/account, but for now, the record is in the deposit table)

  return deposit;
}

export async function getMemberTotalSavings(
  savingGroupId: string,
  userId: string
): Promise<number> {
  const result = await prisma.deposit.aggregate({
    _sum: {
      amount: true,
    },
    where: {
      savingGroupId,
      userId,
    },
  });

  return result._sum.amount?.toNumber() || 0;
}

export async function getGroupDepositHistory(
  savingGroupId: string
): Promise<Deposit[]> {
  const history = await prisma.deposit.findMany({
    where: {
      savingGroupId,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
  return history;
}

// Function to check loan eligibility (saved >= 2000 for 2 consecutive months)
// NOTE: This requires more complex SQL/Prisma logic that is difficult to mock perfectly.
// For now, we will create a placeholder function and assume the underlying data structure supports it.
export async function checkLoanEligibility(
  savingGroupId: string,
  userId: string
): Promise<boolean> {
  // Placeholder logic: In a real app, this would query deposits to check monthly minimums
  // for the last two months.
  const totalSavings = await getMemberTotalSavings(savingGroupId, userId);
  return totalSavings >= 4000; // Simplified check for demonstration
}
