import { ProfitDistribution } from "@prisma/client";
import { prisma } from "../db";

// Function to calculate a member's total savings
async function getMemberTotalSavings(
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

// Function to calculate and distribute profits
export async function distributeProfits(
  savingGroupId: string,
  cycleEndDate: Date
): Promise<ProfitDistribution[]> {
  const group = await prisma.savingGroup.findUnique({
    where: { id: savingGroupId },
    select: { totalSavings: true, totalProfits: true },
  });

  if (!group) {
    throw new Error("Saving Group not found.");
  }

  const totalGroupSavings = group.totalSavings.toNumber();
  const totalGroupProfits = group.totalProfits.toNumber();

  if (totalGroupProfits <= 0) {
    return []; // No profits to distribute
  }

  // 1. Get all members (excluding those disqualified by default)
  const members = await prisma.savingGroupMember.findMany({
    where: { savingGroupId },
    select: { userId: true },
  });

  const distributions: ProfitDistribution[] = [];
  let totalSavingsOfEligibleMembers = 0;
  const memberSavingsMap = new Map<string, number>();

  // Calculate total savings of eligible members
  for (const member of members) {
    // Check for disqualification (simplified check for now)
    // In a real app, this would check the loan table for defaulted loans without repayment
    const isDisqualified = false; // Placeholder for complex check

    if (!isDisqualified) {
      const savings = await getMemberTotalSavings(
        savingGroupId,
        member.userId
      );
      memberSavingsMap.set(member.userId, savings);
      totalSavingsOfEligibleMembers += savings;
    }
  }

  if (totalSavingsOfEligibleMembers <= 0) {
    return []; // No eligible members with savings
  }

  // 2. Distribute profits proportionally
  for (const [userId, savings] of memberSavingsMap.entries()) {
    const savingsRatio = savings / totalSavingsOfEligibleMembers;
    const profitShare = totalGroupProfits * savingsRatio;

    if (profitShare > 0) {
      const distribution = await prisma.profitDistribution.create({
        data: {
          savingGroupId,
          userId,
          amount: profitShare,
          cycleEndDate,
        },
      });
      distributions.push(distribution);

      // 3. Update member's savings with their profit share (as a deposit)
      await prisma.deposit.create({
        data: {
          savingGroupId,
          userId,
          payerId: "SYSTEM_PROFIT",
          amount: profitShare,
          commissionAmount: 0,
        },
      });
    }
  }

  // 4. Reset group profits to zero
  await prisma.savingGroup.update({
    where: { id: savingGroupId },
    data: { totalProfits: 0 },
  });

  return distributions;
}
