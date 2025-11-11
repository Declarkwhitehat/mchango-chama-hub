import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Smartphone, Building2, Star, Trash2, Edit } from "lucide-react";

interface PaymentMethod {
  id: string;
  method_type: 'mpesa' | 'airtel_money' | 'bank_account';
  phone_number?: string;
  bank_name?: string;
  account_number?: string;
  account_name?: string;
  is_default: boolean;
}

interface PaymentMethodCardProps {
  method: PaymentMethod;
  onSetDefault: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit?: (method: PaymentMethod) => void;
}

export const PaymentMethodCard = ({ method, onSetDefault, onDelete, onEdit }: PaymentMethodCardProps) => {
  const getIcon = () => {
    if (method.method_type === 'bank_account') {
      return <Building2 className="h-5 w-5 text-primary" />;
    }
    return <Smartphone className="h-5 w-5 text-primary" />;
  };

  const getDisplayText = () => {
    if (method.method_type === 'mpesa') {
      return `M-Pesa: ${method.phone_number}`;
    }
    if (method.method_type === 'airtel_money') {
      return `Airtel Money: ${method.phone_number}`;
    }
    if (method.method_type === 'bank_account') {
      // Mask account number
      const masked = method.account_number?.slice(-4).padStart(method.account_number.length, '*');
      return `${method.bank_name}: ${masked}`;
    }
  };

  const getTypeLabel = () => {
    if (method.method_type === 'mpesa') return 'M-Pesa';
    if (method.method_type === 'airtel_money') return 'Airtel Money';
    return 'Bank Account';
  };

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 flex-1">
          <div className="mt-1">{getIcon()}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className="text-xs">
                {getTypeLabel()}
              </Badge>
              {method.is_default && (
                <Badge className="text-xs gap-1">
                  <Star className="h-3 w-3 fill-current" />
                  Default
                </Badge>
              )}
            </div>
            <p className="text-sm font-medium truncate">{getDisplayText()}</p>
            {method.method_type === 'bank_account' && method.account_name && (
              <p className="text-xs text-muted-foreground">{method.account_name}</p>
            )}
          </div>
        </div>
        
        <div className="flex gap-2">
          {!method.is_default && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onSetDefault(method.id)}
              title="Set as default"
            >
              <Star className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete(method.id)}
            title="Delete"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
};
