import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Layout } from '@/components/Layout';
import {
  getComprehensiveSavingGroupData,
  getGroupMembers,
  addMemberToGroup,
  updateSavingGroup,
  createDeposit,
  createLoanRequest,
  recordLoanApproval,
  getPendingLoans,
  SavingGroup,
  SavingGroupMember,
  Loan,
} from '@/integrations/supabase/savingGroupsApi';
import { useAuth } from '@/contexts/AuthContext'; // Assuming this context exists

// Helper component for displaying data
const StatCard: React.FC<{ title: string, value: string }> = ({ title, value }) => (
  <div className="bg-white p-4 shadow rounded-lg">
    <p className="text-sm font-medium text-gray-500">{title}</p>
    <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
  </div>
);

// Helper component for forms
const FormSection: React.FC<{ title: string, children: React.ReactNode }> = ({ title, children }) => (
  <div className="bg-white p-6 shadow rounded-lg">
    <h3 className="text-xl font-semibold mb-4 border-b pb-2">{title}</h3>
    {children}
  </div>
);

const SavingGroupAdminComponent: React.FC = () => {
  const { id: groupId } = useParams<{ id: string }>();
  const { user } = useAuth(); // Get current user from context
  const queryClient = useQueryClient();

  // --- Data Fetching ---
  const { data: group, isLoading: isLoadingGroup, error: errorGroup } = useQuery<SavingGroup>({
    queryKey: ['savingGroup', groupId],
    queryFn: () => getComprehensiveSavingGroupData(groupId!),
    enabled: !!groupId,
  });

  const { data: members, isLoading: isLoadingMembers, error: errorMembers } = useQuery<SavingGroupMember[]>({
    queryKey: ['groupMembers', groupId],
    queryFn: () => getGroupMembers(groupId!),
    enabled: !!groupId,
  });

  const { data: pendingLoans, isLoading: isLoadingLoans } = useQuery<Loan[]>({
    queryKey: ['pendingLoans', groupId],
    queryFn: () => getPendingLoans(groupId!),
    enabled: !!groupId,
  });

  const isManager = group?.managerId === user?.id;

  if (isLoadingGroup || isLoadingMembers || isLoadingLoans) {
    return <div className="p-6 text-center">Loading Group Details...</div>;
  }

  if (errorGroup || errorMembers || !group) {
    return <div className="p-6 text-center text-red-600">Error loading group: {errorGroup?.message || errorMembers?.message || "Group not found."}</div>;
  }

  // --- Mutations ---

  // 1. Update Group Details
  const [updateFormData, setUpdateFormData] = useState({
    name: group.name,
    description: group.description,
    savingGoal: group.savingGoal,
    maxMembers: group.maxMembers,
    whatsAppGroupLink: group.whatsAppGroupLink,
  });

  const updateGroupMutation = useMutation({
    mutationFn: (data: typeof updateFormData) =>
      updateSavingGroup(groupId!, data.name, data.description, data.savingGoal, data.maxMembers, data.whatsAppGroupLink),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['savingGroup', groupId] });
      alert("Group details updated successfully!");
    },
    onError: (error: any) => alert(`Error updating group: ${error.message}`),
  });

  const handleUpdateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateGroupMutation.mutate(updateFormData);
  };

  // 2. Add Member
  const [newMemberId, setNewMemberId] = useState('');
  const addMemberMutation = useMutation({
    mutationFn: (userId: string) => addMemberToGroup(groupId!, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groupMembers', groupId] });
      setNewMemberId('');
      alert("Member added successfully!");
    },
    onError: (error: any) => alert(`Error adding member: ${error.message}`),
  });

  // 3. Create Deposit
  const [depositAmount, setDepositAmount] = useState(0);
  const [depositMemberId, setDepositMemberId] = useState(user?.id || '');

  const depositMutation = useMutation({
    mutationFn: (data: { userId: string, amount: number }) => createDeposit(groupId!, data.userId, data.amount),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['savingGroup', groupId] });
      alert("Deposit successful!");
      setDepositAmount(0);
    },
    onError: (error: any) => alert(`Deposit failed: ${error.message}`),
  });

  const handleDepositSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    depositMutation.mutate({ userId: depositMemberId, amount: depositAmount });
  };

  // 4. Loan Request
  const [loanAmount, setLoanAmount] = useState(0);
  const loanRequestMutation = useMutation({
    mutationFn: (amount: number) => createLoanRequest(groupId!, amount),
    onSuccess: () => {
      alert("Loan request submitted for approval!");
      setLoanAmount(0);
      queryClient.invalidateQueries({ queryKey: ['pendingLoans', groupId] });
    },
    onError: (error: any) => alert(`Loan request failed: ${error.message}`),
  });

  const handleLoanRequestSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loanRequestMutation.mutate(loanAmount);
  };

  // 5. Loan Approval
  const approveLoanMutation = useMutation({
    mutationFn: (loanId: string) => recordLoanApproval(loanId, groupId!),
    onSuccess: () => {
      alert("Loan approved! Check the loan status.");
      queryClient.invalidateQueries({ queryKey: ['pendingLoans', groupId] });
    },
    onError: (error: any) => alert(`Approval failed: ${error.message}`),
  });

  // --- Render ---
  return (
    <Layout>
      <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-2 text-indigo-700">{group.name}</h1>
      <p className="text-gray-600 mb-6">{group.description}</p>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <StatCard title="Total Savings" value={`KES ${group.totalSavings.toLocaleString()}`} />
        <StatCard title="Total Profits" value={`KES ${group.totalProfits.toLocaleString()}`} />
        <StatCard title="Saving Goal" value={`KES ${group.savingGoal.toLocaleString()}`} />
        <StatCard title="Members" value={`${members?.length || 0} / ${group.maxMembers}`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* --- Left Column: Group Management (Manager Only) --- */}
        {isManager && (
          <div className="lg:col-span-2 space-y-6">
            <FormSection title="Update Group Details">
              <form onSubmit={handleUpdateSubmit} className="space-y-4">
                {/* Name, Description, Goal, Max Members, WhatsApp Link fields */}
                <input type="text" name="name" value={updateFormData.name} onChange={(e) => setUpdateFormData({...updateFormData, name: e.target.value})} placeholder="Group Name" className="w-full p-2 border rounded" required />
                <textarea name="description" value={updateFormData.description} onChange={(e) => setUpdateFormData({...updateFormData, description: e.target.value})} placeholder="Description" className="w-full p-2 border rounded" required />
                <input type="number" name="savingGoal" value={updateFormData.savingGoal} onChange={(e) => setUpdateFormData({...updateFormData, savingGoal: parseFloat(e.target.value) || 0})} placeholder="Saving Goal" className="w-full p-2 border rounded" required />
                <input type="number" name="maxMembers" value={updateFormData.maxMembers} onChange={(e) => setUpdateFormData({...updateFormData, maxMembers: parseFloat(e.target.value) || 0})} placeholder="Max Members" className="w-full p-2 border rounded" required />
                <input type="url" name="whatsAppGroupLink" value={updateFormData.whatsAppGroupLink} onChange={(e) => setUpdateFormData({...updateFormData, whatsAppGroupLink: e.target.value})} placeholder="WhatsApp Link" className="w-full p-2 border rounded" />
                <button type="submit" disabled={updateGroupMutation.isPending} className="w-full py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">
                  {updateGroupMutation.isPending ? 'Updating...' : 'Update Details'}
                </button>
              </form>
            </FormSection>

            <FormSection title="Add Member (Invite)">
              <form onSubmit={(e) => { e.preventDefault(); addMemberMutation.mutate(newMemberId); }} className="flex space-x-2">
                <input type="text" value={newMemberId} onChange={(e) => setNewMemberId(e.target.value)} placeholder="User ID to Add" className="flex-grow p-2 border rounded" required />
                <button type="submit" disabled={addMemberMutation.isPending} className="py-2 px-4 bg-green-600 text-white rounded hover:bg-green-700">
                  {addMemberMutation.isPending ? 'Adding...' : 'Add'}
                </button>
              </form>
            </FormSection>

            <FormSection title={`Pending Loan Approvals (${pendingLoans?.length || 0})`}>
              <ul className="space-y-3">
                {pendingLoans?.map(loan => (
                  <li key={loan.id} className="flex justify-between items-center border-b pb-2">
                    <div>
                      <p className="font-medium">Loan Request: KES {loan.requestedAmount.toLocaleString()}</p>
                      <p className="text-sm text-gray-500">Borrower: {loan.borrowerId}</p>
                    </div>
                    <button onClick={() => approveLoanMutation.mutate(loan.id)} className="px-3 py-1 text-sm bg-red-500 text-white rounded-md hover:bg-red-600">
                      Approve
                    </button>
                  </li>
                ))}
                {(pendingLoans?.length === 0) && <p className="text-gray-500">No pending loans.</p>}
              </ul>
            </FormSection>
          </div>
        )}

        {/* --- Right Column: Financial Actions & Members --- */}
        <div className="lg:col-span-1 space-y-6">
          <FormSection title="Make Deposit">
            <form onSubmit={handleDepositSubmit} className="space-y-4">
              <select value={depositMemberId} onChange={(e) => setDepositMemberId(e.target.value)} className="w-full p-2 border rounded">
                <option value={user?.id}>Deposit for Myself</option>
                {members?.map(m => m.userId !== user?.id && <option key={m.userId} value={m.userId}>{m.userId} (Member)</option>)}
              </select>
              <input type="number" value={depositAmount} onChange={(e) => setDepositAmount(parseFloat(e.target.value) || 0)} placeholder="Amount (KES)" min="100" className="w-full p-2 border rounded" required />
              <button type="submit" disabled={depositMutation.isPending} className="w-full py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                {depositMutation.isPending ? 'Depositing...' : 'Confirm Deposit'}
              </button>
            </form>
          </FormSection>

          <FormSection title="Request Loan">
            <form onSubmit={handleLoanRequestSubmit} className="space-y-4">
              <input type="number" value={loanAmount} onChange={(e) => setLoanAmount(parseFloat(e.target.value) || 0)} placeholder="Loan Amount (KES)" min="1000" className="w-full p-2 border rounded" required />
              <button type="submit" disabled={loanRequestMutation.isPending} className="w-full py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700">
                {loanRequestMutation.isPending ? 'Requesting...' : 'Submit Loan Request'}
              </button>
            </form>
          </FormSection>

          <FormSection title="Group Members">
            <ul className="space-y-2">
              {members?.map(member => (
                <li key={member.userId} className="flex justify-between items-center p-2 border rounded">
                  <span>{member.userId}</span>
                  <span className={`text-sm font-medium ${member.role === 'MANAGER' ? 'text-green-600' : 'text-blue-600'}`}>{member.role}</span>
                </li>
              ))}
            </ul>
          </FormSection>
        </div>
      </div>
    </div>
    </Layout>
  );
};

export const SavingGroupAdmin = SavingGroupAdminComponent;
