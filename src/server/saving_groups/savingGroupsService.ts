import { SavingGroup } from "@prisma/client";
import { prisma } from "../db";

export async function createSavingGroup(
  name: string,
  description: string,
  adminId: string
): Promise<SavingGroup> {
  const savingGroup = await prisma.savingGroup.create({
    data: {
      name,
      description,
      adminId,
      members: {
        create: {
          userId: adminId,
          role: "MANAGER",
        },
      },
    },
  });
  return savingGroup;
}

export async function getSavingGroupById(
  id: string
): Promise<SavingGroup | null> {
  const savingGroup = await prisma.savingGroup.findUnique({
    where: {
      id,
    },
  });
  return savingGroup;
}

export async function getSavingGroupsByAdminId(
  adminId: string
): Promise<SavingGroup[]> {
  const savingGroups = await prisma.savingGroup.findMany({
    where: {
      adminId,
    },
  });
  return savingGroups;
}

export async function getSavingGroupsByMemberId(
  memberId: string
): Promise<SavingGroup[]> {
  const savingGroups = await prisma.savingGroup.findMany({
    where: {
      members: {
        some: {
          userId: memberId,
        },
      },
    },
  });
  return savingGroups;
}

export async function updateSavingGroup(
  id: string,
  name: string,
  description: string
): Promise<SavingGroup> {
  const savingGroup = await prisma.savingGroup.update({
    where: {
      id,
    },
    data: {
      name,
      description,
    },
  });
  return savingGroup;
}

export async function deleteSavingGroup(id: string): Promise<SavingGroup> {
  const savingGroup = await prisma.savingGroup.delete({
    where: {
      id,
    },
  });
  return savingGroup;
}
