## Make admin's commission settings the single source of truth

Today admin can change commission percentages in **Admin → Commission Config**, but most of the app still uses hardcoded constants:

| Surface | Currently uses | Honors admin setting? |
|---|---|---|
| Mchango payment callback | `getCommissionRate('mchango')` from `platform_settings` | ✅ Yes |
| Organization payment callback | `getCommissionRate('organization')` from `platform_settings` | ✅ Yes |
| Chama payment callback | Per-chama `commission_rate` column | ⚠️ Frozen at chama creation |
| Welfare payment callback | Per-welfare `commission_rate` column | ⚠️ Frozen at welfare creation |
| New chama creation (`chama-crud`) | Hardcoded `0.05` fallback | ❌ Ignores admin |
| New welfare creation (`welfare-crud`) | DB column default | ❌ Ignores admin |
| Donation forms (Mchango/Org) | Imported constants `MCHANGO_COMMISSION_RATE` etc. | ❌ Static UI |
| `OverpaymentWallet` info text | `CHAMA_DEFAULT_COMMISSION_RATE` | ❌ Static |
| `CommissionOverview` / `CommissionAnalyticsDashboard` | Constants | ❌ Static math + labels |

### Goal
When the admin saves a new commission rate, every new payment, every form preview, and every analytics figure uses that rate immediately. Existing chamas/welfares keep their stored rate (members agreed to it at creation) — only new groups inherit the admin's current setting.

### Changes

**1. Frontend hook (new)** — `src/hooks/usePlatformCommission.ts`
- Fetches all four keys (`commission_rate_chama|mchango|organization|welfare`) from `platform_settings` in one query.
- Returns `{ chama, mchango, organization, welfare, isLoading }`, with the existing constants as fallback if the row is missing.
- Cached via React Query (5 min stale time) so admin changes propagate quickly without spamming requests.

**2. Frontend forms — read live rate via hook**
- `src/components/DonationForm.tsx` → mchango rate
- `src/components/OrganizationDonationForm.tsx` → organization rate
- `src/components/chama/OverpaymentWallet.tsx` → chama rate (display copy only)
- `src/components/ChamaPaymentForm.tsx` → keep prop-driven per-chama rate (don't override existing chamas), but use the hook as default when no rate is supplied.

**3. Admin dashboards — live rate**
- `src/components/admin/CommissionOverview.tsx` and `CommissionAnalyticsDashboard.tsx`: replace constant multipliers and label text with values from the hook so analytics and the rate badges always reflect the latest admin setting.

**4. Backend — new groups inherit admin's current rate**
- `supabase/functions/chama-crud/index.ts`: when `body.commission_rate` is absent, fetch `commission_rate_chama` via the existing `getCommissionRate()` helper instead of falling back to `0.05`.
- `supabase/functions/welfare-crud/index.ts`: same treatment using `commission_rate_welfare`.

No DB schema changes. No existing chama/welfare rates are modified (those stay locked to what members agreed to). Payments to existing groups continue to use their stored rate; payments to mchango/organizations already track admin's live rate (already correct in code).

### Verification
1. In Admin → Commission Config, change Mchango from 7% → 8%, save.
2. Open the donate dialog on any Mchango — preview text and commission line should show 8% immediately.
3. Create a new chama after changing chama rate — `chama.commission_rate` row reflects the new value.
4. Admin → Commission Overview cards and analytics show new rates.
5. Revert to original rate; verify it propagates back the same way.
