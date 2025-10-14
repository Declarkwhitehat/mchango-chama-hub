# Automatic Payout Order System

## Overview
The Chama platform features an **automatic payout order system** that ensures fair and transparent rotation-based payouts. The order is strictly determined by the date members join the chama and **cannot be modified** by managers or any other user.

## How It Works

### 1. Order Assignment
- When a member joins a chama, they are automatically assigned an `order_index`
- The `order_index` is sequential: 1, 2, 3, 4, etc.
- The chama creator is always assigned `order_index = 1`
- New members get the next available number based on their `joined_at` timestamp

### 2. Payout Rotation
- Members receive payouts in strict order based on their `order_index`
- After the last member receives their payout, the rotation starts again from the first member
- The system tracks completed withdrawals to determine whose turn it is

### 3. Immutability
- The `order_index` **cannot be changed** once assigned
- A database trigger prevents any modifications to the `order_index` field
- This ensures fairness and prevents manipulation by managers

## Database Implementation

### Trigger Protection
```sql
CREATE TRIGGER prevent_order_index_modification
  BEFORE UPDATE ON public.chama_members
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_order_index_change();
```

This trigger will:
- Allow initial `order_index` assignment during member creation
- **Block any attempts** to modify `order_index` after creation
- Return an error message: "Cannot modify order_index. Payout order is automatically determined by join date."

### Edge Function Logic
The `chama-join` edge function:
1. Retrieves the current highest `order_index` in the chama
2. Assigns `nextOrderIndex = currentMax + 1` to the new member
3. The `joined_at` timestamp is automatically set by the database

## Member Code Format
Each member receives a unique member code:
- Format: `{chama-slug}-M{order_index}`
- Example: `tech-savers-M005` (5th member in the "tech-savers" chama)

## UI Display
Members can see:
- Their position in the payout queue
- Estimated date for their next payout
- Current member whose turn it is to receive payout
- All this information is displayed in the Chama Detail page under the Members tab

## Admin Controls
Admins **cannot** change the payout order, but they can:
- Adjust the `max_members` limit for a chama
- View all chama details and member information
- Deactivate/reactivate chamas if needed

## Benefits
1. **Fairness**: No favoritism - strictly based on join date
2. **Transparency**: All members can see the order
3. **Security**: Protected by database triggers
4. **Predictability**: Members know when they'll receive payouts
5. **Trust**: System-controlled, not manager-controlled

## Technical Details

### Tables Involved
- `chama_members`: Stores member information including `order_index`
- `withdrawals`: Tracks completed payouts to determine current turn

### Policies
- Only the system can set `order_index` during member creation
- Managers can approve/reject join requests but cannot modify order
- All approved members can view the payout order

## Example Scenario

1. **John** creates "Tech Savers" chama → `order_index = 1`
2. **Sarah** joins → `order_index = 2`
3. **Mike** joins → `order_index = 3`
4. **Lisa** joins → `order_index = 4`

**Payout Cycle 1:**
- Week 1: John withdraws
- Week 2: Sarah withdraws
- Week 3: Mike withdraws
- Week 4: Lisa withdraws

**Payout Cycle 2:**
- Week 5: John withdraws (starts over)
- Week 6: Sarah withdraws
- And so on...

## Error Handling
If anyone attempts to modify the `order_index`, they will receive:
```
ERROR: Cannot modify order_index. Payout order is automatically determined by join date.
```

This applies to:
- Direct database updates
- Edge function calls
- Admin panel actions
- Any other modification attempts
