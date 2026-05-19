---
name: C2B MSISDN Hashing (Safaricom-side)
description: Daraja hashes MSISDN on C2B callbacks by default; STK callbacks return plain. Not fixable in code.
type: constraint
---
Safaricom Daraja sends `MSISDN` as a SHA-256 hex hash on C2B (Paybill/Till) confirmation callbacks unless the org is allow-listed for unencrypted MSISDN. STK Push callbacks return the plain phone because we supplied it in the request.

**Do NOT** add/remove hashing logic in `c2b-confirm-payment` — none exists. `normalizeMsisdn()` correctly returns `null` for hashed values so we skip SMS gracefully.

**Why:** Privacy/PCI default on Safaricom's side.
**How to fix:** Email apisupport@safaricom.co.ke requesting "unencrypted MSISDN on C2B callbacks" for shortcode 4015351. No code change needed once enabled.
