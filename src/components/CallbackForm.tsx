import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Phone, X } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface CallbackFormProps {
  question: string;
  conversationHistory: Message[];
  onSuccess: () => void;
  onCancel: () => void;
}

export function CallbackForm({ question, conversationHistory, onSuccess, onCancel }: CallbackFormProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const formatPhoneNumber = (value: string): string => {
    // Remove all non-digits
    const digits = value.replace(/\D/g, '');
    
    // Format to 254XXXXXXXXX if starts with 07 or 7
    if (digits.startsWith('07') || digits.startsWith('7')) {
      return '254' + digits.slice(-9);
    }
    
    // If already starts with 254, keep it
    if (digits.startsWith('254')) {
      return digits;
    }
    
    return digits;
  };

  const validatePhoneNumber = (phone: string): boolean => {
    const kenyanPhoneRegex = /^254[17]\d{8}$/;
    return kenyanPhoneRegex.test(phone);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const formattedPhone = formatPhoneNumber(phone);
    
    if (!validatePhoneNumber(formattedPhone)) {
      toast({
        title: 'Invalid Phone Number',
        description: 'Please enter a valid Kenyan phone number (e.g., 0712345678)',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const { error } = await supabase.from('customer_callbacks').insert([{
        customer_name: name || null,
        phone_number: formattedPhone,
        question,
        conversation_history: conversationHistory as any,
        status: 'pending'
      }]);

      if (error) throw error;

      toast({
        title: 'Request Submitted',
        description: 'Our team will call you within 24 hours.',
      });

      onSuccess();
    } catch (error) {
      console.error('Error submitting callback:', error);
      toast({
        title: 'Submission Failed',
        description: 'Please try again or call us directly.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-4 border-t bg-muted/50">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Phone className="h-4 w-4 text-primary" />
          <h4 className="font-semibold text-sm">Request Callback</h4>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onCancel}
          className="h-6 w-6"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <Label htmlFor="name" className="text-xs">Name (Optional)</Label>
          <Input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className="h-9"
          />
        </div>
        
        <div>
          <Label htmlFor="phone" className="text-xs">Phone Number *</Label>
          <Input
            id="phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="0712345678"
            required
            className="h-9"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Kenyan number starting with 07 or 254
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isSubmitting}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting || !phone}
            className="flex-1"
          >
            {isSubmitting ? 'Submitting...' : 'Submit'}
          </Button>
        </div>
      </form>
    </div>
  );
}
