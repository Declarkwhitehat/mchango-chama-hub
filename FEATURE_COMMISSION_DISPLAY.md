# Commission & Balance Display Feature

## Overview
This feature implements a global commission and balance display system across all Mchango and Chama pages, showing Total Collected, Commission, and Net Balance with per-transaction commission tracking.

## Commission Rates
- **Mchango**: 15% fixed commission
- **Chama**: 5% default commission (configurable per chama via `commission_rate` field)

## Architecture

### Components Created

#### 1. CommissionDisplay Component
**Location**: `src/components/CommissionDisplay.tsx`

**Purpose**: Reusable component for displaying commission breakdown

**Props**:
- `totalCollected: number` - Total amount collected
- `commissionRate: number` - Commission rate (0.15 for Mchango, 0.05 for Chama)
- `type: 'mchango' | 'chama'` - Type of campaign
- `showBreakdown?: boolean` - Whether to show detailed breakdown (default: true)

**Features**:
- Three-column layout showing Total Collected, Commission, Net Balance
- Color-coded display (orange for commission, primary for net balance)
- Detailed breakdown section with calculation
- Responsive design (stacks on mobile, 3-column on desktop)
- Icons for visual clarity (DollarSign, TrendingDown, Wallet)
- Note: "Commission is deducted at the time of payout/withdrawal"

#### 2. Commission Calculator Utilities
**Location**: `src/utils/commissionCalculator.ts`

**Functions**:
- `calculateCommission(amount, rate)` - Calculate commission amount
- `calculateNetBalance(amount, rate)` - Calculate net after commission
- `calculateTransactionNet(amount, rate)` - Calculate per-transaction net
- `formatCommissionPercentage(rate)` - Format rate as percentage string
- `getMchangoCommissionInfo(totalAmount)` - Get full commission info for Mchango
- `getChamaCommissionInfo(totalAmount, customRate?)` - Get full commission info for Chama

### Integration Points

#### 1. Mchango Detail Page
**File**: `src/pages/MchangoDetail.tsx`

**Changes**:
- Added `CommissionDisplay` component after campaign header
- Props: `totalCollected={campaign.current_amount}`, `commissionRate={0.15}`, `type="mchango"`
- Shows commission breakdown for all visitors

#### 2. Chama Detail Page
**File**: `src/pages/ChamaDetail.tsx`

**Changes**:
- Added `commission_rate` to `ChamaData` interface
- Added `CommissionDisplay` component (visible to approved members only)
- Props: `totalCollected={totalSavings}`, `commissionRate={chama.commission_rate || 0.05}`, `type="chama"`
- Positioned after campaign header, before manager tools

#### 3. Donors List Component
**File**: `src/components/DonorsList.tsx`

**Changes**:
- Simplified to show "Recent Contributors" instead of "Financial Summary"
- Per-donation display now shows:
  - Gross amount: `KES {donation.amount}`
  - Net amount: `Net: KES {donation.amount * 0.85}` (after 15% commission)
- Removed redundant financial summary (now handled by CommissionDisplay)

#### 4. Member Dashboard
**File**: `src/components/MemberDashboard.tsx`

**Changes**:
- Added `CommissionDisplay` at the top of dashboard
- Calculates total contributions from payment history
- Shows commission info using chama's commission rate
- Per-payment display shows:
  - Gross amount
  - Net amount after commission (for completed payments)

## Database Schema

### Chama Table
The `chama` table already includes:
- `commission_rate NUMERIC` - Commission rate (default 0.05)

No database migrations were needed for this feature as the schema already supports commission rates.

## UI/UX Design

### Color Scheme
- **Total Collected**: Standard foreground color with muted background
- **Commission**: Orange/warning color (`text-orange-600`, `bg-orange-50`)
- **Net Balance**: Primary color with primary background tint

### Layout
```
┌──────────────────────────────────────────────────────┐
│ Balance & Commission                                  │
│ X% commission deducted at payout                     │
├──────────────────────────────────────────────────────┤
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐    │
│ │💰 Total     │ │📉 Commission│ │💳 Net Balance│   │
│ │ Collected   │ │   (X%)      │ │  Available   │   │
│ │ KES 10,000  │ │ KES 1,500   │ │ KES 8,500    │   │
│ └─────────────┘ └─────────────┘ └─────────────┘    │
├──────────────────────────────────────────────────────┤
│ Commission Breakdown:                                 │
│ Total Collected:        KES 10,000                   │
│ Commission (15%):       - KES 1,500                  │
│ ─────────────────────────────────                   │
│ Net Balance:            KES 8,500                    │
│                                                      │
│ * Commission is deducted at the time of payout      │
└──────────────────────────────────────────────────────┘
```

### Responsive Behavior
- **Mobile (< 768px)**: Single column stack
- **Tablet/Desktop (≥ 768px)**: Three-column grid

## Commission Calculation Formulas

### Mchango (15%)
```typescript
commission = totalCollected × 0.15
netBalance = totalCollected - commission
transactionNet = transactionAmount × 0.85
```

### Chama (5% default)
```typescript
commission = totalCollected × commissionRate
netBalance = totalCollected - commission
transactionNet = transactionAmount × (1 - commissionRate)
```

## User Permissions

### Mchango
- ✅ All visitors can see commission info (public campaigns)
- ✅ Shows on campaign detail page

### Chama
- ✅ Approved members can see commission info
- ❌ Non-members cannot see commission display
- ✅ Shows on chama detail page and member dashboard

## Testing

### Unit Tests
See `COMMISSION_DISPLAY_TESTS.md` for comprehensive test scenarios including:
- Commission calculation accuracy
- UI display tests
- Per-transaction commission display
- Edge cases (zero amounts, decimals, large numbers)
- Responsive design tests
- Permission-based visibility

### Manual Testing Checklist
- [ ] Mchango with KES 10,000 shows Commission KES 1,500, Net KES 8,500
- [ ] Chama with KES 50,000 shows Commission KES 2,500, Net KES 47,500
- [ ] Per-donation shows net amount correctly
- [ ] Per-contribution shows net amount correctly
- [ ] Commission display hidden for non-members on chama pages
- [ ] Responsive layout works on mobile, tablet, desktop
- [ ] Color coding is correct and accessible
- [ ] Breakdown section displays correctly
- [ ] Commission message shows: "deducted at payout/withdrawal"

## Future Enhancements

### Phase 1 (Current)
- ✅ Display commission info
- ✅ Calculate net balances
- ✅ Per-transaction commission display
- ✅ Responsive design

### Phase 2 (Future)
- [ ] Commission deduction at payout
- [ ] Transaction history with commission tracking
- [ ] Commission reports for managers
- [ ] Export commission data
- [ ] Admin commission settings
- [ ] Variable commission rates per campaign type

### Phase 3 (Future)
- [ ] Commission analytics dashboard
- [ ] Automated commission payments
- [ ] Commission dispute resolution
- [ ] Multi-tier commission rates

## API Impact

### No Backend Changes Required
This feature is entirely frontend-based and uses existing data:
- Mchango: Uses `current_amount` from `mchango` table
- Chama: Uses `commission_rate` from `chama` table
- Calculates commission and net balance in frontend

### Future API Endpoints
When implementing actual commission deduction:
```typescript
POST /functions/v1/process-payout
{
  "entity_id": "uuid",
  "entity_type": "mchango" | "chama",
  "gross_amount": 10000,
  "commission_rate": 0.15,
  // Backend calculates:
  // commission = 1500
  // net_payout = 8500
}
```

## Files Changed

### Created
- `src/components/CommissionDisplay.tsx` - Main commission display component
- `src/utils/commissionCalculator.ts` - Commission calculation utilities
- `COMMISSION_DISPLAY_TESTS.md` - Comprehensive test documentation
- `FEATURE_COMMISSION_DISPLAY.md` - This feature documentation

### Modified
- `src/pages/MchangoDetail.tsx` - Added CommissionDisplay component
- `src/pages/ChamaDetail.tsx` - Added CommissionDisplay component and commission_rate to interface
- `src/components/DonorsList.tsx` - Updated to show per-donation net amounts
- `src/components/MemberDashboard.tsx` - Added commission display and per-contribution net amounts

### No Changes Required
- Database schema (commission_rate already exists)
- Backend APIs (commission calculated in frontend)
- Authentication/Authorization (uses existing member checks)

## Deployment Notes

1. **No Database Migrations**: Feature uses existing schema
2. **No Breaking Changes**: Purely additive feature
3. **Backward Compatible**: Works with existing data
4. **No Environment Variables**: No configuration needed
5. **Zero Downtime Deployment**: Safe to deploy anytime

## Support & Maintenance

### Common Issues
1. **Commission not showing**: Check if user is approved member (for chama)
2. **Wrong percentage**: Verify commission_rate in database
3. **Calculation errors**: Check for null/undefined values in amounts

### Debugging
```typescript
// Log commission calculations
console.log('Commission Debug:', {
  totalAmount: 10000,
  rate: 0.15,
  commission: 10000 * 0.15, // Should be 1500
  netBalance: 10000 - (10000 * 0.15), // Should be 8500
});
```

### Monitoring
- Track commission display render errors
- Monitor calculation accuracy
- Watch for edge cases with very large/small amounts

## Glossary

- **Total Collected**: Gross amount before commission
- **Commission**: Platform fee (15% for Mchango, 5% for Chama)
- **Net Balance**: Amount available after commission deduction
- **Gross Amount**: Full donation/contribution amount
- **Net Amount**: Donation/contribution after commission
- **Commission Rate**: Percentage charged as fee
- **Payout**: Transfer of funds to beneficiary (when commission is deducted)
