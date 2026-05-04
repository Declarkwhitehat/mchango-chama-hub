import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PlatformMinimums {
  minChamaContribution: number;
  minWithdrawal: {
    chama: number;
    mchango: number;
    welfare: number;
  };
}

const DEFAULTS: PlatformMinimums = {
  minChamaContribution: 20,
  minWithdrawal: { chama: 100, mchango: 100, welfare: 100 },
};

const KEYS = [
  "min_chama_contribution",
  "min_withdrawal_chama",
  "min_withdrawal_mchango",
  "min_withdrawal_welfare",
];

function readAmount(value: unknown, fallback: number): number {
  if (value && typeof value === "object" && "amount" in (value as any)) {
    const n = Number((value as any).amount);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return fallback;
}

async function fetchMinimums(): Promise<PlatformMinimums> {
  // platform_settings is admin-RLS-restricted; non-admin users will get empty rows.
  // In that case the safe defaults take over, which is fine — the backend re-validates.
  const { data } = await supabase
    .from("platform_settings")
    .select("setting_key, setting_value")
    .in("setting_key", KEYS);

  const map = new Map<string, unknown>();
  for (const row of data || []) map.set(row.setting_key, (row as any).setting_value);

  return {
    minChamaContribution: readAmount(map.get("min_chama_contribution"), DEFAULTS.minChamaContribution),
    minWithdrawal: {
      chama: readAmount(map.get("min_withdrawal_chama"), DEFAULTS.minWithdrawal.chama),
      mchango: readAmount(map.get("min_withdrawal_mchango"), DEFAULTS.minWithdrawal.mchango),
      welfare: readAmount(map.get("min_withdrawal_welfare"), DEFAULTS.minWithdrawal.welfare),
    },
  };
}

export function usePlatformMinimums() {
  const { data } = useQuery({
    queryKey: ["platform-minimums"],
    queryFn: fetchMinimums,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
  return data ?? DEFAULTS;
}
