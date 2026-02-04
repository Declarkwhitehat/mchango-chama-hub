import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Calendar, Plus, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface ExtendCampaignDaysProps {
  campaignId: string;
  currentEndDate: string | null;
  onSuccess: () => void;
}

const MAX_EXTENSION_DAYS = 90;

export const ExtendCampaignDays = ({ campaignId, currentEndDate, onSuccess }: ExtendCampaignDaysProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [daysToAdd, setDaysToAdd] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const getDaysLeft = () => {
    if (!currentEndDate) return 0;
    const now = new Date();
    const end = new Date(currentEndDate);
    const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : 0;
  };

  const currentDaysLeft = getDaysLeft();
  const isExpired = currentDaysLeft === 0;

  const calculateNewEndDate = (days: number) => {
    // If expired, start from today; otherwise extend from current end date
    const baseDate = isExpired ? new Date() : new Date(currentEndDate!);
    const newEnd = new Date(baseDate);
    newEnd.setDate(newEnd.getDate() + days);
    return newEnd;
  };

  const handleExtend = async () => {
    const days = parseInt(daysToAdd);
    
    if (isNaN(days) || days < 1) {
      toast.error("Please enter a valid number of days (1 or more)");
      return;
    }

    if (days > MAX_EXTENSION_DAYS) {
      toast.error(`Maximum extension is ${MAX_EXTENSION_DAYS} days`);
      return;
    }

    setIsLoading(true);

    try {
      const newEndDate = calculateNewEndDate(days);

      const { error } = await supabase
        .from('mchango')
        .update({ end_date: newEndDate.toISOString() })
        .eq('id', campaignId);

      if (error) throw error;

      toast.success(`Campaign extended by ${days} days!`);
      setIsOpen(false);
      setDaysToAdd("");
      onSuccess();
    } catch (error: any) {
      console.error('Error extending campaign:', error);
      toast.error("Failed to extend campaign");
    } finally {
      setIsLoading(false);
    }
  };

  const previewNewEndDate = daysToAdd && parseInt(daysToAdd) > 0 && parseInt(daysToAdd) <= MAX_EXTENSION_DAYS
    ? calculateNewEndDate(parseInt(daysToAdd))
    : null;

  return (
    <Card className={isExpired ? "border-destructive" : ""}>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Campaign Duration
        </CardTitle>
        <CardDescription>
          {isExpired 
            ? "Your campaign has ended. Extend it to continue receiving donations."
            : `${currentDaysLeft} days remaining`
          }
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isExpired && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Your campaign has expired and is no longer visible to the public. Add more days to reactivate it.
            </AlertDescription>
          </Alert>
        )}

        <div className="text-sm text-muted-foreground">
          {currentEndDate && (
            <p>
              {isExpired ? "Ended" : "Ends"}: {new Date(currentEndDate).toLocaleDateString('en-GB', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric'
              })}
            </p>
          )}
        </div>

        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button className="w-full" variant={isExpired ? "default" : "outline"}>
              <Plus className="h-4 w-4 mr-2" />
              {isExpired ? "Reactivate Campaign" : "Extend Campaign"}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {isExpired ? "Reactivate Your Campaign" : "Extend Campaign Duration"}
              </DialogTitle>
              <DialogDescription>
                Add more days to your campaign (maximum {MAX_EXTENSION_DAYS} days at a time)
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="days">Number of days to add</Label>
                <Input
                  id="days"
                  type="number"
                  min="1"
                  max={MAX_EXTENSION_DAYS}
                  value={daysToAdd}
                  onChange={(e) => setDaysToAdd(e.target.value)}
                  placeholder={`1-${MAX_EXTENSION_DAYS}`}
                />
              </div>

              {previewNewEndDate && (
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-sm font-medium">New end date:</p>
                  <p className="text-sm text-muted-foreground">
                    {previewNewEndDate.toLocaleDateString('en-GB', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric'
                    })}
                  </p>
                </div>
              )}

              {daysToAdd && parseInt(daysToAdd) > MAX_EXTENSION_DAYS && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Maximum extension is {MAX_EXTENSION_DAYS} days
                  </AlertDescription>
                </Alert>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleExtend} 
                disabled={isLoading || !daysToAdd || parseInt(daysToAdd) < 1 || parseInt(daysToAdd) > MAX_EXTENSION_DAYS}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Extending...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Add {daysToAdd || 0} Days
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};
