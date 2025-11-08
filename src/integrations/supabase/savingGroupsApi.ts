import { supabase } from "./client";

// --- Type Definitions (Based on Backend Logic) ---

export type SavingGroupRole = "MANAGER" | "MEMBER";

export interface SavingGroup {
  id: string;
  name: string;
  description: string;
  managerId: string;
  savingGoal: number;
  maxMembers: number;
  whatsAppGroupLink: string;
  totalSavings: number;
  totalProfits: number;
}

export interface SavingGroupMember {
  id: string;
  savingGroupId: string;
  userId: string;
  role: SavingGroupRole;
}

export interface Deposit {
  id: string;
  savingGroupId: string;
  userId: string;
  payerId: string;
  amount: number;
  commissionAmount: number;
  createdAt: string;
}

export interface Loan {
  id: string;
  savingGroupId: string;
  borrowerId: string;
  requestedAmount: number;
  disbursedAmount: number;
  principalAmount: number;
  commissionDeducted: number;
  profitDeducted: number;
  status: string; // PENDING_APPROVAL, DISBURSED, REPAID, DEFAULTED
  is_active: boolean;
}

// --- API Utility Functions ---

const callEdgeFunction = async <T>(
  functionName: string,
  method: "GET" | "POST" | "PUT" | "DELETE",
  body?: any
): Promise<T> => {
  const { data, error } = await supabase.functions.invoke(functionName, {
    method,
    body,
  });

  if (error) {
    throw new Error(error.message);
  }

  if (data.error) {
    throw new Error(data.error);
  }

  return data as T;
};

// --- Saving Group CRUD ---

export const createSavingGroup = async (
  name: string,
  description: string,
  savingGoal: number,
  maxMembers: number,
  whatsAppGroupLink: string
): Promise<SavingGroup> => {
  return callEdgeFunction<SavingGroup>("saving-group-crud", "POST", {
    name,
    description,
    savingGoal,
    maxMembers,
    whatsAppGroupLink,
  });
};

export const getManagerSavingGroups = async (): Promise<SavingGroup[]> => {
  return callEdgeFunction<SavingGroup[]>("saving-group-crud", "GET", {
    path: "/manager",
  });
};

export const getMemberSavingGroups = async (): Promise<SavingGroup[]> => {
  return callEdgeFunction<SavingGroup[]>("saving-group-crud", "GET", {
    path: "/member",
  });
};

export const getComprehensiveSavingGroupData = async (
  id: string
): Promise<SavingGroup> => {
  return callEdgeFunction<SavingGroup>("saving-group-crud", "GET", {
    path: `/group/comprehensive/${id}`,
  });
};

export const updateSavingGroup = async (
  id: string,
  name: string,
  description: string,
  savingGoal: number,
  maxMembers: number,
  whatsAppGroupLink: string
): Promise<SavingGroup> => {
  return callEdgeFunction<SavingGroup>("saving-group-crud", "PUT", {
    path: `/group/${id}`,
    name,
    description,
    savingGoal,
    maxMembers,
    whatsAppGroupLink,
  });
};

// --- Member Management ---

export const addMemberToGroup = async (
  savingGroupId: string,
  userId: string
): Promise<SavingGroupMember> => {
  return callEdgeFunction<SavingGroupMember>("saving-group-member-crud", "POST", {
    path: "/add",
    savingGroupId,
    userId,
  });
};

export const getGroupMembers = async (
  savingGroupId: string
): Promise<SavingGroupMember[]> => {
  return callEdgeFunction<SavingGroupMember[]>("saving-group-member-crud", "GET", {
    path: `/list/${savingGroupId}`,
  });
};

// --- Deposit Management ---

export const createDeposit = async (
  savingGroupId: string,
  userId: string,
  amount: number
): Promise<Deposit> => {
  return callEdgeFunction<Deposit>("deposit-crud", "POST", {
    path: "/create",
    savingGroupId,
    userId,
    amount,
  });
};

export const getMemberTotalSavings = async (
  savingGroupId: string,
  userId: string
): Promise<{ totalSavings: number }> => {
  return callEdgeFunction<{ totalSavings: number }>("deposit-crud", "GET", {
    path: `/savings/${savingGroupId}/${userId}`,
  });
};

export const getGroupDepositHistory = async (
  savingGroupId: string
): Promise<Deposit[]> => {
  return callEdgeFunction<Deposit[]>("deposit-crud", "GET", {
    path: `/history/${savingGroupId}`,
  });
};

// --- Loan Management ---

export const createLoanRequest = async (
  savingGroupId: string,
  requestedAmount: number
): Promise<Loan> => {
  return callEdgeFunction<Loan>("loan-crud", "POST", {
    path: "/request",
    savingGroupId,
    requestedAmount,
  });
};

export const getPendingLoans = async (
  savingGroupId: string
): Promise<Loan[]> => {
  return callEdgeFunction<Loan[]>("loan-crud", "GET", {
    path: `/pending/${savingGroupId}`,
  });
};

export const recordLoanApproval = async (
  loanId: string,
  savingGroupId: string
): Promise<any> => {
  return callEdgeFunction<any>("loan-approval-crud", "POST", {
    path: "/approve",
    loanId,
    savingGroupId,
  });
};
