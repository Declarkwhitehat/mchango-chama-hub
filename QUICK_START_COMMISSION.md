# Commission Display - Quick Start Guide

## Overview
Commission and balance display is now implemented globally across all Mchango and Chama pages.

## Key Features

✅ **Mchango**: 15% commission  
✅ **Chama**: 5% commission (configurable)  
✅ **Total Collected** - Gross amount before commission  
✅ **Commission Amount** - Platform fee  
✅ **Net Balance** - Available for payout  
✅ **Per-Transaction Display** - Shows net amount after commission  

## Where to See It

### 1. Mchango Detail Page
**URL**: `/mchango/{slug}`  
**Visible to**: All visitors  
**Location**: After campaign header, before donation form

**Displays**:
- Total Collected: Full donation amount
- Commission (15%): Platform fee
- Net Balance: Amount available for beneficiary
- Per-donation: Each donor sees gross and net amount

**Example**:
```
Total Collected: KES 10,000
Commission (15%): KES 1,500
Net Balance: KES 8,500
```

### 2. Chama Detail Page
**URL**: `/chama/{slug}`  
**Visible to**: Approved members only  
**Location**: After chama header, before manager tools

**Displays**:
- Total Collected: All contributions combined
- Commission (5%): Platform fee (uses chama.commission_rate)
- Net Balance: Amount available for payouts
- Note: Commission varies per chama based on commission_rate field

**Example**:
```
Total Collected: KES 50,000
Commission (5%): KES 2,500
Net Balance: KES 47,500
```

### 3. Member Dashboard
**URL**: `/chama/{slug}` (Dashboard tab)  
**Visible to**: Approved members  
**Location**: Top of dashboard

**Displays**:
- Commission info based on total contributions
- Per-contribution: Shows net amount for each payment
- Payment history includes commission deduction details

**Example per contribution**:
```
Date: 2025-01-15
Amount: KES 1,000
Reference: MPesa-XXX123
Status: Completed
Net: KES 950 (after 5% commission)
```

### 4. Donors List
**URL**: `/mchango/{slug}` (Contributors section)  
**Visible to**: All visitors  
**Location**: Right side column on detail page

**Displays**:
- Each donation with gross amount
- Net amount after 15% commission
- Real-time updates as donations come in

**Example**:
```
John Doe
KES 1,000
Net: KES 850
2 hours ago
```

## Testing the Feature

### Test 1: View Mchango Commission
1. Go to any Mchango detail page
2. Look for "Balance & Commission" card
3. Verify:
   - Total Collected shows current_amount
   - Commission (15%) = Total × 0.15
   - Net Balance = Total - Commission
   - Breakdown section displays correctly

### Test 2: View Chama Commission
1. Join a Chama and get approved
2. Go to Chama detail page
3. Verify:
   - Commission display appears (after header, before manager tools)
   - Commission (5%) = Total × commission_rate
   - Net Balance calculation is correct

### Test 3: Per-Transaction Display
1. View donors list on Mchango page
2. Check each donation shows:
   - Gross amount (what donor paid)
   - Net amount (after 15% commission)
3. Go to Member Dashboard in Chama
4. Check payment history shows:
   - Gross contribution amount
   - Net amount after commission

### Test 4: Responsive Design
1. View commission display on:
   - Mobile (< 768px): Should stack vertically
   - Desktop (≥ 768px): Should show 3 columns
2. All text should be readable at all sizes

## Calculator Examples

### Mchango (15%)
| Total | Commission | Net Balance |
|-------|-----------|-------------|
| KES 1,000 | KES 150 | KES 850 |
| KES 10,000 | KES 1,500 | KES 8,500 |
| KES 100,000 | KES 15,000 | KES 85,000 |

### Chama (5%)
| Total | Commission | Net Balance |
|-------|-----------|-------------|
| KES 10,000 | KES 500 | KES 9,500 |
| KES 50,000 | KES 2,500 | KES 47,500 |
| KES 100,000 | KES 5,000 | KES 95,000 |

## Important Notes

### Commission Deduction Timing
⚠️ **Commission is deducted at payout/withdrawal**  
- During collection: Shows projected commission
- At payout: Commission actually deducted
- Message displayed: "Commission is deducted at the time of payout/withdrawal"

### Permission-Based Visibility
- **Mchango**: All visitors see commission
- **Chama**: Only approved members see commission
- **Non-members**: Cannot see chama commission info

### Commission Rates
- **Mchango**: Fixed 15% (MCHANGO_COMMISSION_RATE = 0.15)
- **Chama**: Variable per chama (default 5%, stored in commission_rate column)
- Rates can be customized per chama during creation

### Color Coding
- 🟢 **Net Balance**: Primary/green color (positive amount)
- 🟠 **Commission**: Orange/warning color (deducted amount)
- ⚪ **Total Collected**: Standard foreground color

## Troubleshooting

### Commission not showing
- **For Mchango**: Should always show to all visitors
- **For Chama**: Check if user is approved member
- **Debug**: Check browser console for errors

### Wrong commission percentage
- **Mchango**: Should always be 15%
- **Chama**: Check commission_rate in database
- **Query**: `SELECT commission_rate FROM chama WHERE id = '{id}'`

### Calculation errors
- Check for null/undefined in totalCollected
- Verify commission_rate exists and is numeric
- Console log: `{ total, rate, commission, net }`

### Not responsive
- Check screen size breakpoints
- Verify Tailwind classes: `grid-cols-1 md:grid-cols-3`
- Test on actual mobile device

## For Developers

### Using CommissionDisplay Component
```typescript
import { CommissionDisplay } from "@/components/CommissionDisplay";

// For Mchango
<CommissionDisplay 
  totalCollected={campaign.current_amount}
  commissionRate={0.15}
  type="mchango"
  showBreakdown={true}
/>

// For Chama
<CommissionDisplay 
  totalCollected={totalSavings}
  commissionRate={chama.commission_rate || 0.05}
  type="chama"
  showBreakdown={true}
/>
```

### Using Commission Utilities
```typescript
import { 
  calculateCommission, 
  calculateNetBalance,
  getMchangoCommissionInfo,
  getChamaCommissionInfo 
} from "@/utils/commissionCalculator";

// Calculate for Mchango
const mchangoInfo = getMchangoCommissionInfo(10000);
// Returns: { totalAmount: 10000, commission: 1500, netBalance: 8500, rate: 0.15, percentage: "15%" }

// Calculate for Chama
const chamaInfo = getChamaCommissionInfo(50000, 0.05);
// Returns: { totalAmount: 50000, commission: 2500, netBalance: 47500, rate: 0.05, percentage: "5%" }

// Per-transaction net
const transactionNet = calculateTransactionNet(1000, 0.15); // 850
```

### Database Schema
No changes needed! Uses existing fields:
- `mchango.current_amount` - Total donations
- `chama.commission_rate` - Commission percentage (default 0.05)
- `contributions.amount` - Individual contributions
- `mchango_donations.amount` - Individual donations

## Next Steps

### Immediate Actions
1. ✅ Feature is live - test on all pages
2. ✅ Verify calculations are accurate
3. ✅ Check responsive design
4. ✅ Confirm permission-based visibility

### Future Enhancements
- [ ] Commission deduction at actual payout
- [ ] Transaction history with commission tracking
- [ ] Commission reports for managers/admins
- [ ] Export commission data to CSV
- [ ] Admin dashboard for commission analytics

## Support

### Questions?
- Check `COMMISSION_DISPLAY_TESTS.md` for comprehensive tests
- Read `FEATURE_COMMISSION_DISPLAY.md` for technical details
- Review component code in `src/components/CommissionDisplay.tsx`

### Found a Bug?
1. Check console for errors
2. Verify commission_rate exists in database
3. Test with different amounts (small, large, zero)
4. Check user permissions (member vs non-member)

### Need Changes?
- Commission rates: Update constants in `commissionCalculator.ts`
- UI styling: Modify `CommissionDisplay.tsx`
- Calculations: Update utility functions
- Visibility: Adjust permission checks in page components
