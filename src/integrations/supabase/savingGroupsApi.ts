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
  path: string = "",
  method: "GET" | "POST" | "PUT" | "DELETE" = "GET",
  body?: any
): Promise<T> => {
  // Construct the full function URL with path
  const functionUrl = path ? `${functionName}${path}` : functionName;
  
  const { data, error } = await supabase.functions.invoke(functionUrl, {
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
  return callEdgeFunction<SavingGroup>("saving-group-crud", "/create", "POST", {
    name,
    description,
    savingGoal,
    maxMembers,
    whatsAppGroupLink,
  });
};

export const getManagerSavingGroups = async (): Promise<SavingGroup[]> => {
  return callEdgeFunction<SavingGroup[]>("saving-group-crud", "/manager", "GET");
};

export const getMemberSavingGroups = async (): Promise<SavingGroup[]> => {
  return callEdgeFunction<SavingGroup[]>("saving-group-crud", "/member", "GET");
};

export const getComprehensiveSavingGroupData = async (
  id: string
): Promise<SavingGroup> => {
  return callEdgeFunction<SavingGroup>("saving-group-crud", `/group/${id}`, "GET");
};

export const updateSavingGroup = async (
  id: string,
  name: string,
  description: string,
  savingGoal: number,
  maxMembers: number,
  whatsAppGroupLink: string
): Promise<SavingGroup> => {
  return callEdgeFunction<SavingGroup>("saving-group-crud", `/group/${id}`, "PUT", {
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
  return callEdgeFunction<SavingGroupMember>("saving-group-member-crud", "/add", "POST", {
    savingGroupId,
    userId,
  });
};

export const getGroupMembers = async (
  savingGroupId: string
): Promise<SavingGroupMember[]> => {
  return callEdgeFunction<SavingGroupMember[]>("saving-group-member-crud", `/list/${savingGroupId}`, "GET");
};

// --- Deposit Management ---

export const createDeposit = async (
  savingGroupId: string,
  userId: string,
  amount: number
): Promise<Deposit> => {
  return callEdgeFunction<Deposit>("deposit-crud", "/create", "POST", {
    savingGroupId,
    userId,
    amount,
  });
};

export const getMemberTotalSavings = async (
  savingGroupId: string,
  userId: string
): Promise<{ totalSavings: number }> => {
  return callEdgeFunction<{ totalSavings: number }>("deposit-crud", `/savings/${savingGroupId}/${userId}`, "GET");
};

export const getGroupDepositHistory = async (
  savingGroupId: string
): Promise<Deposit[]> => {
  return callEdgeFunction<Deposit[]>("deposit-crud", `/history/${savingGroupId}`, "GET");
};

// --- Loan Management ---

export const createLoanRequest = async (
  savingGroupId: string,
  requestedAmount: number
): Promise<Loan> => {
  return callEdgeFunction<Loan>("loan-crud", "/request", "POST", {
    savingGroupId,
    requestedAmount,
  });
};

export const getPendingLoans = async (
  savingGroupId: string
): Promise<Loan[]> => {
  return callEdgeFunction<Loan[]>("loan-crud", `/pending/${savingGroupId}`, "GET");
};

export const recordLoanApproval = async (
  loanId: string,
  savingGroupId: string
): Promise<any> => {
  return callEdgeFunction<any>("loan-approval-crud", "/approve", "POST", {
    loanId,
    savingGroupId,
  });
};
