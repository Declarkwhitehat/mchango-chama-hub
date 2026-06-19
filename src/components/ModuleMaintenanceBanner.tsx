import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useIsModuleInMaintenance, type MaintenanceModuleKey } from "@/hooks/useMaintenanceModules";

const LABEL: Record<Exclude<MaintenanceModuleKey, "global">, string> = {
  chama: "Chama payments",
  welfare: "Welfare contributions and withdrawals",
  donations: "Donations",
  withdrawals: "Withdrawals",
};

interface Props {
  module: Exclude<MaintenanceModuleKey, "global">;
  className?: string;
}

export function ModuleMaintenanceBanner({ module, className }: Props) {
  const { inMaintenance } = useIsModuleInMaintenance(module);
  if (!inMaintenance) return null;
  return (
    <Alert
      className={`border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-100 ${className ?? ""}`}
    >
      <AlertTriangle className="h-4 w-4 text-amber-600" />
      <AlertTitle>{LABEL[module]} are paused for maintenance</AlertTitle>
      <AlertDescription>
        Any payment you've already sent is safe and will be applied automatically once we're back online.
      </AlertDescription>
    </Alert>
  );
}
