import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";

interface Props {
  campaignId: string;
  campaignTitle: string;
  availableBalance: number;
}

export function DeleteExpiredCampaignCard({ campaignId, campaignTitle, availableBalance }: Props) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const hasFunds = Number(availableBalance) > 0;

  const canDelete =
    confirm.trim().toLowerCase() === campaignTitle.trim().toLowerCase() && !busy;

  const handleDelete = async () => {
    if (!canDelete) return;
    setBusy(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess?.session) {
        toast.error("Please log in again.");
        setBusy(false);
        return;
      }
      const { data, error } = await supabase.functions.invoke("mchango-creator-delete", {
        body: { mchango_id: campaignId, confirm_title: confirm },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      const swept = Number((data as any)?.swept_amount || 0);
      if (swept > 0) {
        toast.success(
          `Campaign deleted. KES ${swept.toLocaleString()} moved to platform revenue.`
        );
      } else {
        toast.success("Campaign deleted.");
      }
      setOpen(false);
      navigate("/mchango");
    } catch (e: any) {
      toast.error(e?.message || "Failed to delete campaign");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="border-destructive/50">
      <CardHeader>
        <CardTitle className="text-destructive flex items-center gap-2">
          <Trash2 className="h-5 w-5" /> Delete This Campaign
        </CardTitle>
        <CardDescription>
          This campaign has ended. You can permanently delete it here.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasFunds && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Warning: this campaign still holds funds</AlertTitle>
            <AlertDescription>
              KES {Number(availableBalance).toLocaleString()} is still in this campaign.
              If you delete it now, these funds will be forfeited to platform revenue and
              cannot be recovered. Withdraw first if you want to keep the money.
            </AlertDescription>
          </Alert>
        )}
        <Button variant="destructive" onClick={() => { setConfirm(""); setOpen(true); }}>
          <Trash2 className="h-4 w-4 mr-2" /> Delete Campaign
        </Button>
      </CardContent>

      <AlertDialog open={open} onOpenChange={(v) => !busy && setOpen(v)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">
              Permanently delete “{campaignTitle}”?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <span className="block">
                This will remove the campaign and all its donation records. This action
                cannot be undone.
              </span>
              {hasFunds && (
                <span className="block text-destructive font-semibold">
                  KES {Number(availableBalance).toLocaleString()} will be moved to
                  platform revenue.
                </span>
              )}
              <span className="block">
                To confirm, type the campaign title exactly:{" "}
                <strong>{campaignTitle}</strong>
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            autoFocus
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Type campaign title to confirm"
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDelete(); }}
              disabled={!canDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Delete Permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
