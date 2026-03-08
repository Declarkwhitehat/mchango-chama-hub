

## Campaign Withdrawal Donor Notifications

### What we're building
When a campaign (mchango) creator requests a withdrawal, notify all donors who have user accounts. Donors without accounts see a prompt to create one on the campaign detail page.

### Changes

**1. `supabase/functions/withdrawals-crud/index.ts`** — After mchango withdrawal is created (~line 519):
- Query `mchango_donations` for the campaign to get all unique `user_id`s (non-null, completed donations)
- For each donor with an account, create a notification: "The campaign [title] has withdrawn KES [amount]. This is for your transparency."
- This runs using `supabaseAdmin` to bypass RLS

**2. `src/pages/MchangoDetail.tsx`** — Add a banner for unauthenticated users or donors without accounts:
- If user is not logged in and viewing the campaign, show an info alert: "Create an account to receive updates and withdrawal notifications for campaigns you contribute to."
- Link to the auth page

**3. `src/components/DonationForm.tsx`** — After successful donation by unauthenticated user:
- Show a toast/prompt encouraging them to create an account for transparency updates

**4. `supabase/functions/_shared/notifications.ts`** — Add a new template:
- `campaignWithdrawal(campaignName, amount)` — notification template for donor alerts

### Backend notification logic (withdrawals-crud, mchango POST section ~line 496-519):
```
// After creating withdrawal and getting entityName for mchango:
if (mchango_id) {
  // Get all unique donors with accounts
  const { data: donors } = await supabaseAdmin
    .from('mchango_donations')
    .select('user_id')
    .eq('mchango_id', mchango_id)
    .eq('payment_status', 'completed')
    .not('user_id', 'is', null);

  const uniqueDonorIds = [...new Set(donors?.map(d => d.user_id).filter(Boolean))];
  // Exclude the creator (they already get their own notification)
  const donorIdsToNotify = uniqueDonorIds.filter(id => id !== user.id);

  for (const donorId of donorIdsToNotify) {
    await createNotification(supabaseAdmin, {
      userId: donorId,
      title: 'Campaign Withdrawal Notice',
      message: `The campaign "${entityName}" has withdrawn KES ${netAmount.toLocaleString()}. If you find this suspicious, please contact customer care.`,
      type: 'info',
      category: 'campaign',
      relatedEntityId: mchango_id,
      relatedEntityType: 'mchango',
    });
  }
}
```

### Files to modify:
- `supabase/functions/withdrawals-crud/index.ts` — add donor notification after mchango withdrawal creation
- `supabase/functions/_shared/notifications.ts` — add `campaignWithdrawal` template
- `src/pages/MchangoDetail.tsx` — add "create account for updates" banner for non-logged-in users
- `src/components/DonationForm.tsx` — add post-donation prompt for anonymous donors

### No database changes needed
All required tables (`mchango_donations`, `notifications`) already exist.

