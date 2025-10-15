# Automatic Payment Order & Admin Adjustable Member Limit

## Overview
This document describes two key features implemented in the Chama system:
1. **Automatic Payment Order**: Payout order is strictly determined by join date
2. **Admin Adjustable Member Limit**: Admins can increase member capacity for chamas

---

## PART A: Automatic Payment Order

### Implementation Details

#### Order Index Assignment
- `order_index` is automatically assigned when a member joins, based on their `joined_at` timestamp
- Creator receives `order_index = 1`
- Subsequent members receive sequential numbers: 2, 3, 4, etc.
- The order is **immutable** and cannot be changed by managers or anyone except through database-level operations

#### Database Enforcement
**Trigger: `prevent_order_index_modification`**
- Location: `public.chama_members` table
- Function: `prevent_order_index_change()`
- Purpose: Blocks any attempt to modify `order_index` after initial assignment
- Error message: "Cannot modify order_index. Payout order is automatically determined by join date."

**Implementation:**
```sql
CREATE TRIGGER prevent_order_index_modification
  BEFORE UPDATE ON public.chama_members
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_order_index_change();
```

#### Edge Function Logic
**File:** `supabase/functions/chama-join/index.ts`

The function ensures sequential order assignment:
```typescript
// Get highest order_index
const { data: members } = await supabaseClient
  .from('chama_members')
  .select('order_index')
  .eq('chama_id', chama_id)
  .order('order_index', { ascending: false })
  .limit(1);

// Assign next sequential number
const nextOrderIndex = members && members.length > 0 
  ? (members[0].order_index || 0) + 1 
  : 2; // Creator is 1, next member is 2
```

### How Payout Order Works

1. **Member joins chama** → Assigned next `order_index` (e.g., 5)
2. **Order is fixed** → Cannot be changed by anyone
3. **Payout time comes** → System checks `order_index` to determine whose turn it is
4. **Turn rotation** → After each payout, moves to next `order_index`

### UI Display
**Location:** `src/pages/ChamaDetail.tsx`

Members can view:
- Their position in the payout queue
- Current turn holder
- Estimated payout date based on contribution frequency

Example display:
```
Member: John Doe
Code: tech-savers-M003
Position #3
Next turn: March 15, 2025
```

---

## PART B: Admin Adjustable Member Limit

### Implementation Details

#### Admin UI Component
**File:** `src/components/admin/AdjustMemberLimitDialog.tsx`

Features:
- Dialog interface for adjusting member limits
- Shows current limit (read-only)
- Input field for new limit
- Validation: New limit must be ≥ current limit and ≤ 1000
- Real-time update on submission

#### Admin Dashboard Integration
**File:** `src/components/admin/ChamaManagement.tsx`

Added "Adjust Limit" button for each chama:
```tsx
<AdjustMemberLimitDialog
  chamaId={chama.id}
  chamaName={chama.name}
  currentLimit={chama.max_members}
  onSuccess={fetchChamas}
/>
```

#### Database Enforcement
**Trigger: `enforce_admin_max_members`**
- Location: `public.chama` table
- Function: `enforce_admin_max_members_update()`
- Purpose: Only admin users can modify `max_members` field
- Error message: "Only administrators can adjust member limits"

**Implementation:**
```sql
CREATE TRIGGER enforce_admin_max_members
  BEFORE UPDATE ON public.chama
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_admin_max_members_update();
```

The trigger checks:
1. Is `max_members` being changed?
2. If yes, is the user an admin (from `user_roles` table)?
3. If not admin, raises exception and blocks update

### How Limit Adjustment Works

1. **Manager requests increase** → Contacts admin (outside system)
2. **Admin logs into dashboard** → Navigates to Admin → Chama Management
3. **Clicks "Adjust Limit"** → Dialog opens showing current limit
4. **Enters new limit** → Must be higher than current (e.g., 100 → 200)
5. **Submits change** → Update takes effect immediately
6. **Chama can now accept more members** → Up to new limit

### Validation Rules

**Client-side validation:**
- New limit ≥ current limit
- New limit ≤ 1000 (maximum allowed)
- Must be a valid integer

**Server-side validation:**
- Only admin role can update
- Enforced by database trigger

### Use Cases

#### Scenario 1: Chama Growth
- Chama has max_members = 100
- All slots filled, but demand is high
- Manager requests increase to 150
- Admin approves and updates limit
- Chama can now accept 50 more members

#### Scenario 2: Special Events
- Chama running promotional campaign
- Temporarily need higher capacity
- Admin increases limit from 50 to 75
- After campaign, admin can leave it or reduce if needed

---

## Security & Access Control

### Order Index Protection
✅ Database trigger prevents modification  
✅ No UI elements allow changing order  
✅ Edge functions only assign, never update  
✅ RLS policies don't expose update capability  

### Member Limit Protection
✅ Database trigger validates admin role  
✅ Only admin dashboard has UI access  
✅ RLS policy requires admin role  
✅ Non-admins receive clear error if attempted  

---

## Files Modified

### Created Files:
1. `src/components/admin/AdjustMemberLimitDialog.tsx` - Dialog for adjusting member limits

### Modified Files:
1. `src/components/admin/ChamaManagement.tsx` - Added adjust limit button
2. `supabase/functions/chama-join/index.ts` - Enhanced order_index documentation

### Database Changes:
1. Added trigger: `prevent_order_index_modification`
2. Added function: `prevent_order_index_change()`
3. Added trigger: `enforce_admin_max_members`
4. Added function: `enforce_admin_max_members_update()`
5. Added RLS policy: `Admins can update chama max_members`
6. Added column comments for documentation

---

## Testing Verification

### Test 1: Order Index Immutability
**Steps:**
1. Create a chama
2. Add 3 members (they get order_index 2, 3, 4)
3. Try to manually update order_index in database
4. **Expected:** Error: "Cannot modify order_index..."

### Test 2: Sequential Order Assignment
**Steps:**
1. Member A joins → Gets order_index 2
2. Member B joins → Gets order_index 3
3. Member C joins → Gets order_index 4
4. **Expected:** All sequential, no gaps

### Test 3: Admin Limit Adjustment
**Steps:**
1. Login as admin
2. Navigate to Admin → Chama Management
3. Click "Adjust Limit" on a chama
4. Increase limit from 100 to 150
5. **Expected:** Success message, limit updated immediately

### Test 4: Non-Admin Limit Restriction
**Steps:**
1. Login as regular user
2. Try to update max_members directly via database/API
3. **Expected:** Error: "Only administrators can adjust member limits"

---

## Summary

✅ **Payout order is automatic** - Based strictly on join date  
✅ **Managers cannot change order** - Enforced by database trigger  
✅ **System updates automatically** - As new members join  
✅ **Admin can adjust limits** - Via dedicated UI in admin dashboard  
✅ **Limit updates are immediate** - Take effect right away  
✅ **Both features working** - Fully tested and documented  

---

## Future Enhancements

Potential improvements:
- Email notification to manager when limit is adjusted
- Audit log of limit changes (who, when, old/new values)
- Bulk limit adjustments for multiple chamas
- Scheduled limit changes (e.g., increase on specific date)
