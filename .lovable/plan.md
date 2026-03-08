

## Simplify Chama Detail Page

Based on your selections, here is the plan:

### Changes

**1. Remove "Transparency" tab**
- Remove the `TabsTrigger` and `TabsContent` for `transparency` from `ChamaDetail.tsx`
- Remove the `PaymentTransparency` import (can keep the component file in case it's needed later)

**2. Remove "Details" tab**
- Remove the `TabsTrigger` and `TabsContent` for `details`
- Remove the `WhatsAppLinkManager` from the Details tab (move the WhatsApp link to the Members tab where it already has a WhatsApp button, so no loss of functionality)
- The creation date, frequency, and capacity are already shown in the header card, so this tab is redundant

**3. Resulting tab bar**
The simplified tabs will be:
- **Dashboard** (member payment history)
- **Payments** (manager only)
- **Members** (member list — keep as-is per your choice)
- **Chat** (members only)

This reduces tabs from 6 to 3-4 depending on role, removing visual clutter.

### Files
| Action | File |
|--------|------|
| Edit | `src/pages/ChamaDetail.tsx` — remove Transparency + Details tabs, move WhatsApp link to Members tab |

