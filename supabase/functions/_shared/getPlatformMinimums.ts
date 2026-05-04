// Shared helper for reading admin-configurable minimum amounts from platform_settings.
// Falls back to safe defaults if a setting is missing or malformed.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

export type EntityKind = 'chama' | 'mchango' | 'welfare';

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
  'min_chama_contribution',
  'min_withdrawal_chama',
  'min_withdrawal_mchango',
  'min_withdrawal_welfare',
] as const;

function readAmount(value: unknown, fallback: number): number {
  if (value && typeof value === 'object' && 'amount' in (value as any)) {
    const n = Number((value as any).amount);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return fallback;
}

export async function getPlatformMinimums(): Promise<PlatformMinimums> {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    const { data } = await supabase
      .from('platform_settings')
      .select('setting_key, setting_value')
      .in('setting_key', KEYS as unknown as string[]);

    const map = new Map<string, unknown>();
    for (const row of data || []) map.set(row.setting_key, row.setting_value);

    return {
      minChamaContribution: readAmount(map.get('min_chama_contribution'), DEFAULTS.minChamaContribution),
      minWithdrawal: {
        chama: readAmount(map.get('min_withdrawal_chama'), DEFAULTS.minWithdrawal.chama),
        mchango: readAmount(map.get('min_withdrawal_mchango'), DEFAULTS.minWithdrawal.mchango),
        welfare: readAmount(map.get('min_withdrawal_welfare'), DEFAULTS.minWithdrawal.welfare),
      },
    };
  } catch (e) {
    console.error('getPlatformMinimums failed, using defaults:', e);
    return DEFAULTS;
  }
}

export function withdrawalMinFor(
  mins: PlatformMinimums,
  ids: { chama_id?: string | null; mchango_id?: string | null; organization_id?: string | null; welfare_id?: string | null }
): { kind: EntityKind; min: number } {
  if (ids.welfare_id) return { kind: 'welfare', min: mins.minWithdrawal.welfare };
  if (ids.mchango_id || ids.organization_id) return { kind: 'mchango', min: mins.minWithdrawal.mchango };
  return { kind: 'chama', min: mins.minWithdrawal.chama };
}
