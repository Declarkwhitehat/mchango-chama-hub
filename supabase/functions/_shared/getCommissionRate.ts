import { COMMISSION_RATES } from "./commissionRates.ts";

type EntityType = 'chama' | 'mchango' | 'organization' | 'welfare';

const KEY_MAP: Record<EntityType, string> = {
  chama: 'commission_rate_chama',
  mchango: 'commission_rate_mchango',
  organization: 'commission_rate_organization',
  welfare: 'commission_rate_welfare',
};

const FALLBACK: Record<EntityType, number> = {
  chama: COMMISSION_RATES.CHAMA,
  mchango: COMMISSION_RATES.MCHANGO,
  organization: COMMISSION_RATES.ORGANIZATION,
  welfare: COMMISSION_RATES.WELFARE,
};

export async function getCommissionRate(supabase: any, type: EntityType): Promise<number> {
  try {
    const { data } = await supabase
      .from('platform_settings')
      .select('setting_value')
      .eq('setting_key', KEY_MAP[type])
      .maybeSingle();
    const val = data?.setting_value;
    if (val && typeof val === 'object' && typeof val.rate === 'number' && val.rate >= 0 && val.rate <= 0.5) {
      return val.rate;
    }
  } catch (_e) { /* ignore */ }
  return FALLBACK[type];
}
