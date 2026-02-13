

# Admin M-Pesa Transaction Search

## Overview
Add a dedicated, professionally designed admin page for searching M-Pesa transactions by their transaction ID, restricted to the last 30 days. The search will query across all payment tables (transactions, mchango_donations, organization_donations) to identify where the funds were directed.

## What Will Be Built

### 1. New Edge Function: `admin-mpesa-search`
A secure backend function that:
- Validates the user is an admin (same pattern as `admin-search`)
- Accepts an M-Pesa transaction ID string
- Automatically restricts queries to the last 30 days
- Searches across three tables using `payment_reference`:
  - `transactions` (Chama contributions) -- joined with `chama` for the group name
  - `mchango_donations` (Campaign donations) -- joined with `mchango` for the campaign title
  - `organization_donations` (Org donations) -- joined with `organizations` for the org name
- Returns matched records with date, time, amount, destination type, and destination name

### 2. New Page: `AdminMpesaSearch.tsx`
A clean, professional admin page featuring:
- A search input with placeholder text (e.g., "Enter M-Pesa Transaction ID e.g. SLK7H6Y5X4")
- A search button with loading state
- Results displayed in a card layout showing:
  - M-Pesa Transaction ID
  - Date and Time of transaction
  - Amount (formatted as KES)
  - Destination type badge (Chama / Campaign / Organization)
  - Destination name
- Empty state: "No transaction found within the last 30 days."
- Info banner noting the 30-day search window

### 3. Routing and Navigation
- Register route `/admin/mpesa-search` in `App.tsx` (wrapped in `AdminProtectedRoute`)
- Add sidebar link in `AdminSidebar.tsx` under the Financial section

## Technical Details

### Edge Function Query Logic
```text
For each table:
  SELECT relevant columns
  WHERE payment_reference = [exact match]
  AND created_at >= now() - 30 days
```

Results are normalized into a unified response format:
- `transaction_id`, `date`, `time`, `amount`, `destination_type`, `destination_name`, `status`

### Security
- Admin-only access enforced at two levels:
  1. `AdminProtectedRoute` wrapper on the frontend
  2. JWT verification + `user_roles` admin check in the edge function

### Files to Create
- `supabase/functions/admin-mpesa-search/index.ts`
- `src/pages/AdminMpesaSearch.tsx`

### Files to Modify
- `src/App.tsx` -- add lazy import and route
- `src/components/admin/AdminSidebar.tsx` -- add menu item

