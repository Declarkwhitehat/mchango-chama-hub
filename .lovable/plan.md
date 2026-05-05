## Problems

1. **Total Collected wrong.** Chama shows incorrect figure. Verified data:
   - Gross contributions: 70 (40 + 30)
   - Two cycle contributions of 20 each = 40 gross → 38 net (5% commission)
   - Remainder (30 gross) → 28.50 net sat in overpayment wallet (pending)
   - Correct "Total Collected" = **KES 38** (net, allocated to cycles, after commission)
   - My previous fix used `gross − pendingWallet` which gave 41.5 (still wrong, mixes gross and net).

2. **Invite link visible after chama starts.** Manager invite manager renders for every active chama; should be hidden once started and re-shown only when needed (e.g., chama is `pending`, accepting rejoins, or a seat is open).

3. **Web/native parity.** Native app loads the same remote URL via Capacitor (per memory), so any fix on the web propagates automatically — confirm no platform-conditional rendering blocks this view.

## Plan

### 1. Fix Total Collected formula (`src/pages/ChamaDetail.tsx`)
Replace the current calculation with the net-cycle formula:

```
totalCollected = available_balance + total_withdrawn
```

This represents lifetime net amount that has actually entered cycle pools (paid out + still available), and naturally excludes pending overpayment wallet balances and commission. For the current chama: 38 + 0 = **KES 38**. ✓

Relabel the card to "Total Collected (Net)" with a small helper note: "After 5% commission. Overpayment wallet shown separately." to remove ambiguity for members.

### 2. Hide invite link after chama starts (`src/pages/ChamaDetail.tsx`)
Wrap `<ChamaInviteManager>` so it only renders when:
- `chama.status === 'pending'` (recruiting), OR
- `chama.accepting_rejoin_requests === true` (rejoin window open), OR
- active member count `< max_members` AND manager explicitly opens it (collapsible "Invite new members" toggle, collapsed by default)

Default state for active chamas: invite hidden. Manager sees a small "Invite members" button that expands the manager only when there is genuine capacity.

### 3. Web/native parity confirmation
- Verify no `Capacitor.isNativePlatform()` gates on the Total Collected card or invite section.
- Bump version indicator (per memory standard) so the user can confirm the APK is loading the latest build.

### 4. Memory update
Update `mem://financial/ledger-and-balance-standards` with the explicit rule:
> "Total Collected" displayed to chama members = `available_balance + total_withdrawn` (net, post-commission, cycle-allocated). Never gross. Overpayment wallet is reported separately on the member's own dashboard.

## Files to change
- `src/pages/ChamaDetail.tsx` — fix formula + relabel card + gate invite manager
- `mem/financial/ledger-and-balance-standards.md` — codify Total Collected rule

No backend/migration changes required.
