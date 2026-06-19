import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  CHAMA_DEFAULT_COMMISSION_RATE,
  MCHANGO_COMMISSION_RATE,
  ORGANIZATION_COMMISSION_RATE,
} from "@/utils/commissionCalculator";

const WELFARE_FALLBACK = 0.05;

const KEYS = [
  "commission_rate_chama",
  "commission_rate_mchango",
  "commission_rate_organization",
  "commission_rate_welfare",
] as const;

export interface PlatformCommissionRates {
  chama: number;
  mchango: number;
  organization: number;
  welfare: number;
}

const FALLBACKS: PlatformCommissionRates = {
  chama: CHAMA_DEFAULT_COMMISSION_RATE,
  mchango: MCHANGO_COMMISSION_RATE,
  organization: ORGANIZATION_COMMISSION_RATE,
  welfare: WELFARE_FALLBACK,
};

const pick = (row: any, fallback: number): number => {
  const v = row?.setting_value;
  if (v && typeof v === "object" && typeof v.rate === "number" && v.rate >= 0 && v.rate <= 0.5) {
    return v.rate;
  }
  return fallback;
};

export const usePlatformCommission = () => {
  const { data, isLoading } = useQuery({
    queryKey: ["platform-commission-rates"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<PlatformCommissionRates> => {
      const { data, error } = await supabase
        .from("platform_settings")
        .select("setting_key, setting_value")
        .in("setting_key", KEYS as unknown as string[]);
      if (error) return FALLBACKS;
      const find = (k: string) => data?.find((d: any) => d.setting_key === k);
      return {
        chama: pick(find("commission_rate_chama"), FALLBACKS.chama),
        mchango: pick(find("commission_rate_mchango"), FALLBACKS.mchango),
        organization: pick(find("commission_rate_organization"), FALLBACKS.organization),
        welfare: pick(find("commission_rate_welfare"), FALLBACKS.welfare),
      };
    },
  });

  return { rates: data ?? FALLBACKS, isLoading };
};
