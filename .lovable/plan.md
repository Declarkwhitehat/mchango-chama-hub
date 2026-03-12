

## Plan: Database Performance Audit and Optimization

### 1. Database Indexing — New Indexes Needed

After auditing the schema and all query patterns, here are the **missing indexes** (existing ones are already solid for basic lookups):

| Table | Column(s) | Reason |
|-------|-----------|--------|
| `contributions` | `(chama_id, status)` | Frequent filtered queries in reconciliation, settlement, reports |
| `contributions` | `(member_id, status)` | Settlement queries filter by member + status |
| `contributions` | `created_at DESC` | Activity page, admin transactions sort by date |
| `transactions` | `created_at DESC` | Activity page, admin user detail sort by date |
| `withdrawals` | `requested_by` | Activity page filters by user |
| `withdrawals` | `(status, created_at DESC)` | Admin withdrawals filter by status + sort |
| `withdrawals` | `chama_id` | Reconciliation sums by chama |
| `withdrawals` | `welfare_id` | Welfare withdrawal queries |
| `mchango_donations` | `(user_id, created_at DESC)` | Activity page user lookup + sort |
| `mchango_donations` | `mchango_id` | Campaign detail, admin campaigns |
| `organization_donations` | `(user_id, created_at DESC)` | Activity page user lookup + sort |
| `organization_donations` | `organization_id` | Organization detail page |
| `welfare_contributions` | `(welfare_id, user_id)` | Welfare detail queries |
| `welfare_contributions` | `member_id` | Member contribution lookups |
| `welfare_members` | `(welfare_id, user_id, status)` | Membership checks |
| `notifications` | `(user_id, is_read, created_at DESC)` | NotificationBell queries unread + sorted |
| `financial_ledger` | `(source_type, created_at DESC)` | Ledger table filtered by source + sorted |
| `financial_ledger` | `reference_id` | Idempotency checks in settlement |
| `company_earnings` | `group_id` | Reconciliation sums by group |
| `member_cycle_payments` | `(cycle_id, member_id)` | Cycle payment lookups |
| `member_cycle_payments` | `(member_id, is_paid)` | Payment status checks |
| `chama_member_debts` | `(member_id, status)` | Debt settlement queries |
| `chama_cycle_deficits` | `(non_payer_member_id, status)` | Deficit lookups |
| `contribution_cycles` | `(chama_id, is_complete)` | Active cycle lookups |
| `audit_logs` | `(user_id, created_at DESC)` | Already has separate indexes but composite is better |
| `settlement_locks` | `contribution_id` | Already UNIQUE from previous migration |
| `profiles` | `phone` | Login lookups by phone |
| `profiles` | `kyc_status` | Admin KYC page filters |
| `chama_members` | `(chama_id, approval_status, status)` | Very frequent membership queries |

### 2. Pagination Implementation

**Frontend components missing pagination:**

| File | Current behavior | Fix |
|------|-----------------|-----|
| `Activity.tsx` | Loads ALL contributions, donations, withdrawals | Add `.limit(50)` to each query |
| `NotificationBell.tsx` | Loads 50 (reasonable) | Keep as-is |
| `AuditLogsTable.tsx` | Loads 100, no "load more" | Add pagination UI |
| `FinancialLedgerTable.tsx` | Loads 100, no "load more" | Add pagination UI |
| `CommissionAnalyticsDashboard.tsx` | Loads ALL ledger entries for date range (no limit) | Add `.limit(500)` |
| `ChamaManagement.tsx` | Loads all chamas | Add `.limit(50)` + pagination |
| `CampaignsManagement.tsx` | Loads all mchangos | Add `.limit(50)` + pagination |
| `UsersManagement.tsx` | Loads all profiles | Add `.limit(50)` + pagination |
| `CustomerCallbacks.tsx` | Loads all callbacks | Add `.limit(50)` + pagination |
| `Home.tsx` | Loads all user's chamas/mchangos (`.limit(10)` on some) | Enforce `.limit(10)` consistently |
| `ChamaList.tsx` | Loads all chamas for user | Add `.limit(20)` |
| `MchangoList.tsx` | Loads all active mchangos | Add `.limit(20)` + pagination |
| `WelfareList.tsx` | Loads all welfares | Add `.limit(20)` + pagination |

**Edge functions missing limits:**

| Function | Issue |
|----------|-------|
| `admin-transactions` | Already has configurable `limit` — good |
| `financial-reconciliation` | Loads ALL contributions/withdrawals per chama — should batch |
| `admin-search` | Should enforce max result limit |

### 3. Query Optimizations

**SELECT * replacements (high-impact tables):**

| File | Table | Fix: Select only needed columns |
|------|-------|--------------------------------|
| `Activity.tsx` contributions | `contributions` | Select `id, amount, status, created_at, chama_id, mpesa_receipt_number` |
| `Activity.tsx` withdrawals | `withdrawals` | Select `id, amount, status, created_at, payment_reference` |
| `FinancialLedgerTable.tsx` | `financial_ledger` | Already needs all columns for display — acceptable |
| `AuditLogsTable.tsx` | `audit_logs` | Select only displayed fields, omit `old_values, new_values` (JSONB blobs) |
| `AdminKYC.tsx` | `profiles` | Select only KYC-relevant fields instead of `*` |
| `CampaignsManagement.tsx` | `mchango` | Already uses targeted select — good |
| `PaymentStatusManager.tsx` | `contributions` | Select only needed fields instead of `*` |

**Duplicate/redundant queries:**
- `Home.tsx` makes 5+ parallel queries — this is actually efficient (Promise.allSettled). No change needed.
- `WithdrawalsManagement` subscribes to ALL changes on `withdrawals` table — should filter to relevant statuses only.
- `CommissionAnalyticsDashboard` fetches ALL ledger entries without limit for chart data — needs limit or aggregation.

### 4. Realtime Subscription Optimization

- `WithdrawalsManagement.tsx`: Subscribes to `event: '*'` on entire `withdrawals` table. Should add filter: `filter: 'status=eq.pending'` or similar to reduce traffic.

### Summary of Changes

**Migration file:** ~30 new indexes via one SQL migration.

**Frontend files to edit (~15):**
- `Activity.tsx` — add limits, select specific columns
- `AuditLogsTable.tsx` — add pagination, select specific columns
- `FinancialLedgerTable.tsx` — add pagination
- `CommissionAnalyticsDashboard.tsx` — add limit
- `CampaignsManagement.tsx` — add limit + pagination
- `ChamaManagement.tsx` — add limit + pagination
- `UsersManagement.tsx` — add limit + pagination
- `CustomerCallbacks.tsx` — add limit + pagination
- `Home.tsx` — enforce consistent limits
- `ChamaList.tsx` — add limit
- `MchangoList.tsx` — add limit + pagination
- `WelfareList.tsx` — add limit + pagination
- `WithdrawalsManagement.tsx` — filter realtime subscription
- `PaymentStatusManager.tsx` — select specific columns
- `AdminKYC.tsx` — select specific columns

**Edge functions:** `financial-reconciliation` — batch processing for large chamas.

