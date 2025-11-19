import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface WebAuthnCredential {
  id: string;
  credential_id: string;
  device_name: string | null;
  created_at: string;
  last_used_at: string | null;
}

export const useWebAuthnManagement = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [credentials, setCredentials] = useState<WebAuthnCredential[]>([]);

  const listCredentials = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('webauthn_credentials')
        .select('id, credential_id, device_name, created_at, last_used_at')
        .order('created_at', { ascending: false });

      if (error) throw error;

      setCredentials(data || []);
      return { success: true, data: data || [] };
    } catch (error: any) {
      console.error('Error listing credentials:', error);
      toast.error('Failed to load biometric devices');
      return { success: false, error: error.message };
    } finally {
      setIsLoading(false);
    }
  };

  const deleteCredential = async (credentialId: string) => {
    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('webauthn_credentials')
        .delete()
        .eq('credential_id', credentialId);

      if (error) throw error;

      // Update local state
      setCredentials(prev => prev.filter(c => c.credential_id !== credentialId));
      
      toast.success('Biometric device removed successfully');
      return { success: true };
    } catch (error: any) {
      console.error('Error deleting credential:', error);
      toast.error('Failed to remove biometric device');
      return { success: false, error: error.message };
    } finally {
      setIsLoading(false);
    }
  };

  return {
    isLoading,
    credentials,
    listCredentials,
    deleteCredential,
  };
};
