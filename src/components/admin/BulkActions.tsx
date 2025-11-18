import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CheckCircle, XCircle, Ban, PlayCircle, Download, MoreHorizontal, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export interface BulkAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  variant?: "default" | "destructive" | "secondary";
  confirmRequired?: boolean;
  confirmTitle?: string;
  confirmDescription?: string;
}

interface BulkActionsProps {
  selectedIds: string[];
  totalCount: number;
  onSelectAll: (selected: boolean) => void;
  onClearSelection: () => void;
  actions: BulkAction[];
  onAction: (actionId: string, selectedIds: string[]) => Promise<void>;
}

export const BulkActions = ({
  selectedIds,
  totalCount,
  onSelectAll,
  onClearSelection,
  actions,
  onAction,
}: BulkActionsProps) => {
  const [processing, setProcessing] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    action: BulkAction | null;
  }>({ open: false, action: null });

  const allSelected = selectedIds.length === totalCount && totalCount > 0;
  const someSelected = selectedIds.length > 0 && selectedIds.length < totalCount;

  const handleAction = async (action: BulkAction) => {
    if (action.confirmRequired) {
      setConfirmDialog({ open: true, action });
    } else {
      await executeAction(action);
    }
  };

  const executeAction = async (action: BulkAction) => {
    setProcessing(true);
    try {
      await onAction(action.id, selectedIds);
      toast({
        title: "Success",
        description: `${action.label} completed for ${selectedIds.length} item(s)`,
      });
      onClearSelection();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || `Failed to ${action.label.toLowerCase()}`,
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
      setConfirmDialog({ open: false, action: null });
    }
  };

  if (selectedIds.length === 0) {
    return (
      <div className="flex items-center gap-3">
        <div className="flex items-center space-x-2">
          <Checkbox
            checked={allSelected}
            onCheckedChange={(checked) => onSelectAll(checked as boolean)}
            aria-label="Select all"
          />
          <span className="text-sm text-muted-foreground">
            Select all ({totalCount})
          </span>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg border">
        <div className="flex items-center space-x-2">
          <Checkbox
            checked={allSelected || someSelected}
            onCheckedChange={(checked) => onSelectAll(checked as boolean)}
            aria-label="Select all"
            ref={(el) => {
              if (el) {
                (el as any).indeterminate = someSelected;
              }
            }}
          />
          <Badge variant="secondary" className="font-semibold">
            {selectedIds.length} selected
          </Badge>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          {actions.map((action) => (
            <Button
              key={action.id}
              variant={action.variant || "secondary"}
              size="sm"
              onClick={() => handleAction(action)}
              disabled={processing}
              className="gap-2"
            >
              {processing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                action.icon
              )}
              {action.label}
            </Button>
          ))}

          <Button
            variant="ghost"
            size="sm"
            onClick={onClearSelection}
            disabled={processing}
          >
            Clear
          </Button>
        </div>
      </div>

      <AlertDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog({ open, action: null })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmDialog.action?.confirmTitle || "Confirm Action"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDialog.action?.confirmDescription ||
                `Are you sure you want to ${confirmDialog.action?.label.toLowerCase()} ${selectedIds.length} selected item(s)? This action cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDialog.action && executeAction(confirmDialog.action)}
              disabled={processing}
            >
              {processing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                "Confirm"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

// Helper hook for managing bulk selection
export const useBulkSelection = <T extends { id: string }>(items: T[]) => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const selectAll = (selected: boolean) => {
    setSelectedIds(selected ? items.map((item) => item.id) : []);
  };

  const clearSelection = () => {
    setSelectedIds([]);
  };

  const isSelected = (id: string) => selectedIds.includes(id);

  return {
    selectedIds,
    toggleSelection,
    selectAll,
    clearSelection,
    isSelected,
  };
};
