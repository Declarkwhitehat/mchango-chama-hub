import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { getManagerSavingGroups, getMemberSavingGroups, SavingGroup } from '@/integrations/supabase/savingGroupsApi';

const GroupCard: React.FC<{ group: SavingGroup, isManager: boolean }> = ({ group, isManager }) => (
  <Link to={`/saving-groups/${group.id}`} className="block p-4 border rounded-lg shadow-md hover:shadow-lg transition-shadow duration-200">
    <h2 className="text-xl font-semibold text-indigo-600">{group.name}</h2>
    <p className="text-sm text-gray-500 mb-2">Role: <span className={`font-medium ${isManager ? 'text-green-600' : 'text-blue-600'}`}>{isManager ? 'Manager' : 'Member'}</span></p>
    <p className="text-gray-700 truncate">{group.description}</p>
    <div className="mt-2 text-sm">
      <p>Goal: KES {group.savingGoal.toLocaleString()}</p>
      <p>Total Savings: KES {group.totalSavings.toLocaleString()}</p>
    </div>
  </Link>
);

const SavingGroupDashboardComponent: React.FC = () => {
  const { data: managedGroups, isLoading: isLoadingManaged, error: errorManaged } = useQuery<SavingGroup[]>({
    queryKey: ['managedGroups'],
    queryFn: getManagerSavingGroups,
  });

  const { data: memberGroups, isLoading: isLoadingMember, error: errorMember } = useQuery<SavingGroup[]>({
    queryKey: ['memberGroups'],
    queryFn: getMemberSavingGroups,
  });

  const isLoading = isLoadingManaged || isLoadingMember;
  const error = errorManaged || errorMember;

  if (isLoading) {
    return <div className="p-6 text-center">Loading Saving Groups...</div>;
  }

  if (error) {
    return <div className="p-6 text-center text-red-600">Error loading groups: {error.message}</div>;
  }

  const allGroups = [...(managedGroups || []), ...(memberGroups || [])];
  const uniqueGroups = Array.from(new Map(allGroups.map(group => [group.id, group])).values());

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-800">My Saving Groups</h1>
        <Link to="/saving-groups/create" className="py-2 px-4 bg-green-600 text-white rounded-md shadow-md hover:bg-green-700 transition-colors">
          + Create New Group
        </Link>
      </div>

      {uniqueGroups.length === 0 ? (
        <div className="text-center p-10 border-2 border-dashed border-gray-300 rounded-lg">
          <p className="text-lg text-gray-600">You are not part of any Saving Group yet.</p>
          <p className="text-md text-gray-500 mt-2">Start by creating one or joining an existing one.</p>
        </div>
      ) : (
        <>
          <h2 className="text-2xl font-semibold mt-8 mb-4 text-gray-700">Groups I Manage</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(managedGroups && managedGroups.length > 0) ? (
              managedGroups.map(group => (
                <GroupCard key={group.id} group={group} isManager={true} />
              ))
            ) : (
              <p className="text-gray-500 col-span-full">You do not manage any groups.</p>
            )}
          </div>

          <h2 className="text-2xl font-semibold mt-8 mb-4 text-gray-700">Groups I'm a Member Of</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(memberGroups && memberGroups.length > 0) ? (
              memberGroups.filter(memberGroup => !managedGroups?.some(managerGroup => managerGroup.id === memberGroup.id)).map(group => (
                <GroupCard key={group.id} group={group} isManager={false} />
              ))
            ) : (
              <p className="text-gray-500 col-span-full">You are not a member of any other groups.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export const SavingGroupDashboard = SavingGroupDashboardComponent;
