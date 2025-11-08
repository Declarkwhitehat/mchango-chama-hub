import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { createSavingGroup } from '@/integrations/supabase/savingGroupsApi';

const CreateSavingGroupPage: React.FC = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    savingGoal: 1000,
    maxMembers: 2,
    whatsAppGroupLink: '',
  });

  const createGroupMutation = useMutation({
    mutationFn: (data: { name: string, description: string, savingGoal: number, maxMembers: number, whatsAppGroupLink: string }) => 
      createSavingGroup(data.name, data.description, data.savingGoal, data.maxMembers, data.whatsAppGroupLink),
    onSuccess: (newGroup) => {
      // In a real app, you would use a toast notification here.
      alert(`Group "${newGroup.name}" created successfully!`);
      navigate(`/saving-groups/${newGroup.id}`);
    },
    onError: (error: any) => {
      console.error("Error creating group:", error);
      alert(`Error creating group: ${error.message}`);
    },
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: (name === 'savingGoal' || name === 'maxMembers') ? parseFloat(value) || 0 : value,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.name && formData.savingGoal > 0 && formData.maxMembers > 1) {
      createGroupMutation.mutate(formData);
    } else {
      alert('Please fill in all required fields and ensure max members is greater than 1.');
    }
  };

  return (
    <div className="p-6 max-w-lg mx-auto">
      <h1 className="text-2xl font-bold mb-4">Create New Saving Group</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700">Group Name *</label>
          <input
            type="text"
            name="name"
            id="name"
            value={formData.name}
            onChange={handleChange}
            required
            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
          />
        </div>
        <div>
          <label htmlFor="savingGoal" className="block text-sm font-medium text-gray-700">Group Saving Goal (KES) *</label>
          <input
            type="number"
            name="savingGoal"
            id="savingGoal"
            value={formData.savingGoal}
            onChange={handleChange}
            required
            min="1000"
            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
          />
        </div>
        <div>
          <label htmlFor="maxMembers" className="block text-sm font-medium text-gray-700">Maximum Members *</label>
          <input
            type="number"
            name="maxMembers"
            id="maxMembers"
            value={formData.maxMembers}
            onChange={handleChange}
            required
            min="2"
            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
          />
        </div>
        <div>
          <label htmlFor="whatsAppGroupLink" className="block text-sm font-medium text-gray-700">WhatsApp Group Link</label>
          <input
            type="url"
            name="whatsAppGroupLink"
            id="whatsAppGroupLink"
            value={formData.whatsAppGroupLink}
            onChange={handleChange}
            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
          />
        </div>
        <div>
          <label htmlFor="description" className="block text-sm font-medium text-gray-700">Group Description</label>
          <textarea
            name="description"
            id="description"
            value={formData.description}
            onChange={handleChange}
            rows={3}
            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
          />
        </div>
        <button
          type="submit"
          disabled={createGroupMutation.isPending}
          className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400"
        >
          {createGroupMutation.isPending ? 'Creating...' : 'Create Group'}
        </button>
      </form>
    </div>
  );
};

export const SavingGroupCreate = CreateSavingGroupPage;
