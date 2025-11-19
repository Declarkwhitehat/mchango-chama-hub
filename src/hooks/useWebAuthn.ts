import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// Helper function to convert base64 to Uint8Array
const base64ToUint8Array = (base64: string): Uint8Array => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

// Helper function to convert Uint8Array to base64
const uint8ArrayToBase64 = (array: Uint8Array): string => {
  return btoa(String.fromCharCode(...array));
};

export const useWebAuthn = () => {
  const [isLoading, setIsLoading] = useState(false);

  // Check if WebAuthn is supported
  const isSupported = () => {
    return window.PublicKeyCredential !== undefined && 
           navigator.credentials !== undefined;
  };

  // Check if user has registered biometric credentials
  const checkHasCredentials = async (emailOrPhone: string) => {
    if (!isSupported()) {
      return false;
    }

    try {
      // Determine if input is email or phone
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const isEmail = emailRegex.test(emailOrPhone);

      // Check with server for registered credentials
      const { data, error } = await supabase.functions.invoke(
        'webauthn-authenticate',
        {
          body: {
            action: 'generate-challenge',
            email: isEmail ? emailOrPhone : undefined,
            phone: !isEmail ? emailOrPhone : undefined
          }
        }
      );

      // Handle different error cases
      if (error) {
        console.log('Credential check error:', error);
        return false;
      }

      // If the response has an error field (404 for no credentials), return false
      if (data?.error) {
        console.log('No credentials found:', data.error);
        return false;
      }

      // If credentials array exists and has items, user has registered biometric
      return data?.credentials && data.credentials.length > 0;
    } catch (error) {
      console.error('Error checking credentials:', error);
      return false;
    }
  };

  // Register a new credential (for enabling biometric login)
  const registerCredential = async (deviceName?: string) => {
    if (!isSupported()) {
      toast.error('Biometric authentication is not supported on this device');
      return { success: false };
    }

    setIsLoading(true);
    try {
      // Get challenge from server
      const { data: challengeData, error: challengeError } = await supabase.functions.invoke(
        'webauthn-register',
        {
          body: { action: 'generate-challenge' }
        }
      );

      if (challengeError || !challengeData) {
        throw new Error('Failed to generate challenge');
      }

      const { challenge, userId, userName } = challengeData;

      // Create credential
      const challengeArray = base64ToUint8Array(challenge);
      const credential = await navigator.credentials.create({
        publicKey: {
          challenge: challengeArray.buffer as ArrayBuffer,
          rp: {
            name: 'Chama & Mchango',
            id: window.location.hostname
          },
          user: {
            id: new TextEncoder().encode(userId),
            name: userName,
            displayName: userName
          },
          pubKeyCredParams: [
            { alg: -7, type: 'public-key' },  // ES256
            { alg: -257, type: 'public-key' }  // RS256
          ],
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            requireResidentKey: false,
            userVerification: 'required'
          },
          timeout: 60000
        }
      }) as PublicKeyCredential;

      if (!credential) {
        throw new Error('Failed to create credential');
      }

      const response = credential.response as AuthenticatorAttestationResponse;
      const credentialId = uint8ArrayToBase64(new Uint8Array(credential.rawId));
      const publicKey = uint8ArrayToBase64(new Uint8Array(response.getPublicKey()!));

      // Register credential with server
      const { data: registerData, error: registerError } = await supabase.functions.invoke(
        'webauthn-register',
        {
          body: {
            action: 'register-credential',
            credentialId,
            publicKey,
            deviceName: deviceName || navigator.userAgent.slice(0, 50)
          }
        }
      );

      if (registerError || !registerData?.success) {
        throw new Error(registerData?.error || 'Failed to register credential');
      }

      toast.success('Biometric login enabled successfully!');
      setIsLoading(false);
      return { success: true };

    } catch (error: any) {
      console.error('Registration error:', error);
      
      if (error.name === 'NotAllowedError') {
        toast.error('Biometric registration was cancelled');
      } else if (error.name === 'NotSupportedError') {
        toast.error('This biometric method is not supported');
      } else {
        toast.error(error.message || 'Failed to enable biometric login');
      }
      
      setIsLoading(false);
      return { success: false };
    }
  };

  // Authenticate using biometric
  const authenticate = async (emailOrPhone: string) => {
    if (!isSupported()) {
      toast.error('Biometric authentication is not supported on this device');
      return { success: false };
    }

    setIsLoading(true);
    try {
      // Determine if input is email or phone
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const isEmail = emailRegex.test(emailOrPhone);

      // Get challenge from server
      const { data: challengeData, error: challengeError } = await supabase.functions.invoke(
        'webauthn-authenticate',
        {
          body: {
            action: 'generate-challenge',
            email: isEmail ? emailOrPhone : undefined,
            phone: !isEmail ? emailOrPhone : undefined
          }
        }
      );

      if (challengeError || !challengeData) {
        throw new Error(challengeData?.error || 'Failed to generate challenge');
      }

      const { challenge, credentials } = challengeData;

      if (!credentials || credentials.length === 0) {
        throw new Error('No biometric credentials found for this account');
      }

      // Get assertion
      const challengeArray = base64ToUint8Array(challenge);
      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge: challengeArray.buffer as ArrayBuffer,
          allowCredentials: credentials.map((cred: any) => {
            const idArray = base64ToUint8Array(cred.id);
            return {
              id: idArray.buffer as ArrayBuffer,
              type: 'public-key' as const
            };
          }),
          timeout: 60000,
          userVerification: 'required'
        }
      }) as PublicKeyCredential;

      if (!assertion) {
        throw new Error('Failed to authenticate');
      }

      const assertionResponse = assertion.response as AuthenticatorAssertionResponse;
      const credentialId = uint8ArrayToBase64(new Uint8Array(assertion.rawId));
      const signature = uint8ArrayToBase64(new Uint8Array(assertionResponse.signature));

      // Verify assertion with server
      const { data: verifyData, error: verifyError } = await supabase.functions.invoke(
        'webauthn-authenticate',
        {
          body: {
            action: 'verify-authentication',
            credentialId,
            signature
          }
        }
      );

      if (verifyError || !verifyData?.success) {
        throw new Error(verifyData?.error || 'Authentication failed');
      }

      // Set session
      if (verifyData.session) {
        await supabase.auth.setSession(verifyData.session);
      }

      toast.success('Logged in successfully with biometrics!');
      setIsLoading(false);
      return { success: true, session: verifyData.session };

    } catch (error: any) {
      console.error('Authentication error:', error);
      
      if (error.name === 'NotAllowedError') {
        toast.error('Biometric authentication was cancelled');
      } else {
        toast.error(error.message || 'Biometric authentication failed');
      }
      
      setIsLoading(false);
      return { success: false };
    }
  };

  return {
    isSupported,
    registerCredential,
    authenticate,
    checkHasCredentials,
    isLoading
  };
};