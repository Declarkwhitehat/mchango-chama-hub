---
name: Welfare Next of Kin Policy
description: Per-welfare next-of-kin nomination, admin-only visibility, 90-day edit lock, member PDF download
type: feature
---
- Table `welfare_next_of_kin` — one record per (welfare_id, user_id). Members fill it separately for each welfare group.
- Fields: full legal name, phone (normalized to 254), date of birth (must be 18+), relationship (+ other text), gender (male/female), acknowledged_at, locked_until.
- Visibility: member sees only their own; platform `admin`/`super_admin` see all. Welfare executives (chairman/secretary/treasurer) must NEVER see next-of-kin details.
- Edit lock: 3 months (90 days), no exceptions. Enforced by RLS UPDATE policy plus a BEFORE UPDATE trigger `enforce_next_of_kin_lock` that raises an error and restamps `locked_until`. No admin override.
- Declaration text (shown in UI and PDF): the nominee is authorised to receive the member's dividends, contributions and any other benefits from the welfare on death or incapacity.
- Members who haven't submitted see an amber reminder banner on the welfare page linking to the form (`#next-of-kin` anchor in the Overview tab).
- Members can download a branded PDF copy (serial `NOK-<memberCode>-<idPrefix>`).
