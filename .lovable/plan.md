

## Plan: Add Monthly Date Selection for Chama Contribution Frequency

### What This Changes
When a creator selects "Monthly" frequency, they can now choose **which day(s)** of the month contributions are due. Options include a single date (e.g., the 1st, 15th, or 30th) or twice a month (e.g., 1st and 15th).

---

### Technical Design

#### 1. Database Migration
Add two new columns to the `chama` table and a new enum value:

```sql
-- Add 'twice_monthly' to the contribution_frequency enum
ALTER TYPE contribution_frequency ADD VALUE IF NOT EXISTS 'twice_monthly';

-- Store which day(s) of the month contributions are due
ALTER TABLE chama ADD COLUMN monthly_contribution_day INTEGER DEFAULT NULL;
ALTER TABLE chama ADD COLUMN monthly_contribution_day_2 INTEGER DEFAULT NULL;
```

- `monthly_contribution_day`: Primary day (1-31), used when frequency is `monthly` or `twice_monthly`
- `monthly_contribution_day_2`: Second day, used only when frequency is `twice_monthly`

#### 2. Frontend Changes (`src/pages/ChamaCreate.tsx`)
- When frequency = `monthly`: show a dropdown to pick the contribution day (1-28, with a note about months with fewer days)
- Add new frequency option `twice_monthly` ("Twice a Month")
- When frequency = `twice_monthly`: show two dropdowns for first and second contribution days
- Validate that the two dates are different

New UI flow:
```text
Frequency: [Monthly ▼]
  → Contribution Day: [15th ▼]

Frequency: [Twice a Month ▼]  
  → First Contribution Day:  [1st ▼]
  → Second Contribution Day: [15th ▼]
```

#### 3. Backend Changes (`supabase/functions/chama-crud/index.ts`)
- Accept `monthly_contribution_day` and `monthly_contribution_day_2` in the POST body
- Validate: day must be 1-28 (to avoid edge cases with 29/30/31)
- Validate: for `twice_monthly`, both days required and must differ
- Store both values in the chama record

#### 4. Cycle Engine Updates (`supabase/functions/chama-start/index.ts` and `daily-payout-cron`)
- `calculateCycleEndDate()`: For `monthly`, use `monthly_contribution_day` to set exact cycle boundaries
- For `twice_monthly`: cycle length = days between the two selected dates (alternating)
- `getCycleLengthInDays()`: Handle `twice_monthly` by calculating gap between the two dates

#### 5. Files to Modify
| File | Change |
|------|--------|
| `supabase/migrations/new.sql` | Add columns + enum value |
| `src/pages/ChamaCreate.tsx` | Add day picker dropdowns, new frequency option |
| `supabase/functions/chama-crud/index.ts` | Accept + validate new fields |
| `supabase/functions/chama-start/index.ts` | Update cycle date calculations |
| `supabase/functions/daily-payout-cron/index.ts` | Handle `twice_monthly` cycle creation |
| `supabase/functions/cycle-auto-create/index.ts` | Handle next cycle date for new frequencies |

