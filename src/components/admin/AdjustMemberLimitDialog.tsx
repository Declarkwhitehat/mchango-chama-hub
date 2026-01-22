import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Users, Loader2 } from "lucide-react";

interface AdjustMemberLimitDialogProps {
  entityId: string;
  entityName: string;
  entityType?: 'chama';
  currentLimit: number;
  maxLimit?: number;
  onSuccess: () => void;
}

export const AdjustMemberLimitDialog = ({ 
  entityId, 
  entityName, 
  entityType = 'chama',
  currentLimit,
  maxLimit = 1000,
  onSuccess 
}: AdjustMemberLimitDialogProps) => {
  const [open, setOpen] = useState(false);
  const [newLimit, setNewLimit] = useState(currentLimit.toString());
  const [processing, setProcessing] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const limitNumber = parseInt(newLimit);
    
    if (isNaN(limitNumber) || limitNumber < currentLimit) {
      toast({
        title: "Invalid Limit",
        description: `New limit must be at least ${currentLimit} (current limit)`,
        variant: "destructive",
      });
      return;
    }

    if (limitNumber > maxLimit) {
      toast({
        title: "Limit Too High",
        description: `Member limit cannot exceed ${maxLimit}`,
        variant: "destructive",
      });
      return;
    }

    setProcessing(true);

    try {
      const { error } = await supabase
        .from(entityType)
        .update({ max_members: limitNumber })
        .eq('id', entityId);

      if (error) throw error;

      toast({
        title: "Success",
        description: `Member limit updated to ${limitNumber}`,
      });

      setOpen(false);
      onSuccess();
    } catch (error: any) {
      console.error('Error updating member limit:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to update member limit",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Users className="h-4 w-4 mr-1" />
          Adjust Limit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adjust Member Limit</DialogTitle>
          <DialogDescription>
            Update the maximum member capacity for "{entityName}"
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label htmlFor="currentLimit">Current Limit</Label>
            <Input
              id="currentLimit"
              value={currentLimit}
              disabled
              className="bg-muted"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="newLimit">
              New Member Limit <span className="text-destructive">*</span>
            </Label>
            <Input
              id="newLimit"
              type="number"
              min={currentLimit}
              max={maxLimit}
              value={newLimit}
              onChange={(e) => setNewLimit(e.target.value)}
              placeholder={`Minimum ${currentLimit}`}
              required
            />
            <p className="text-xs text-muted-foreground">
              Must be at least {currentLimit} and not exceed {maxLimit}
            </p>
          </div>

          <div className="flex gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={processing}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={processing || newLimit === currentLimit.toString()}
              className="flex-1"
            >
              {processing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Updating...
                </>
              ) : (
                "Update Limit"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
