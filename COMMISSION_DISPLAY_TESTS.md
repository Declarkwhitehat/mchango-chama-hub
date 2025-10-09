# Commission & Balance Display - Acceptance Tests

## Overview
This document outlines acceptance tests for commission and balance display across all Mchango and Chama pages, ensuring correct calculation of commissions and net balances.

## Commission Rates
- **Mchango**: 15% commission
- **Chama**: 5% commission (configurable per chama)

## Test Scenarios

### 1. Mchango Commission Display Tests

#### Test 1.1: Basic Commission Display on Mchango Detail Page
**Given:** Mchango has collected KES 10,000  
**When:** User views the mchango detail page  
**Then:**
- Total Collected shows: KES 10,000
- Commission (15%) shows: KES 1,500 (in orange/warning color)
- Net Balance shows: KES 8,500 (in primary color)
- Breakdown section displays the calculation
- Message states: "Commission is deducted at the time of payout/withdrawal"

#### Test 1.2: Zero Balance Mchango
**Given:** Mchango has collected KES 0  
**When:** User views the mchango detail page  
**Then:**
- Total Collected: KES 0
- Commission (15%): KES 0
- Net Balance: KES 0
- All values display correctly without errors

#### Test 1.3: Large Amount Mchango
**Given:** Mchango has collected KES 1,000,000  
**When:** User views the mchango detail page  
**Then:**
- Total Collected: KES 1,000,000
- Commission (15%): KES 150,000
- Net Balance: KES 850,000
- Numbers format with proper thousand separators

#### Test 1.4: Per-Transaction Commission Display
**Given:** Mchango has multiple donations  
**When:** Viewing the donors list  
**Then:**
- Each donation shows gross amount
- Each donation shows net amount after 15% commission
- Example: Donation of KES 1,000 shows "Net: KES 850"

### 2. Chama Commission Display Tests

#### Test 2.1: Basic Commission Display on Chama Detail Page
**Given:** Chama has collected KES 50,000 with 5% commission rate  
**When:** Approved member views the chama detail page  
**Then:**
- Total Collected shows: KES 50,000
- Commission (5%) shows: KES 2,500 (in orange/warning color)
- Net Balance shows: KES 47,500 (in primary color)
- Breakdown section displays the calculation
- Message states: "Commission is deducted at the time of payout/withdrawal"

#### Test 2.2: Custom Commission Rate
**Given:** Chama configured with 3% commission rate, collected KES 100,000  
**When:** Member views the chama detail page  
**Then:**
- Total Collected: KES 100,000
- Commission (3%): KES 3,000
- Net Balance: KES 97,000
- Percentage displays as 3% not 5%

#### Test 2.3: Commission Display Visibility
**Given:** User is viewing chama detail page  
**When:** User is not an approved member  
**Then:**
- Commission display is NOT visible
- Only approved members see commission information

#### Test 2.4: Commission in Member Dashboard
**Given:** Member is viewing their dashboard  
**When:** Dashboard loads  
**Then:**
- Commission information is visible alongside member balances
- Shows how commission affects total pool

### 3. Commission Calculation Tests

#### Test 3.1: Mchango Commission Formula
**Formula:** Commission = Total × 0.15  
**Formula:** Net Balance = Total - Commission

**Test Cases:**
| Total Collected | Commission (15%) | Net Balance |
|----------------|------------------|-------------|
| KES 1,000      | KES 150         | KES 850     |
| KES 5,000      | KES 750         | KES 4,250   |
| KES 50,000     | KES 7,500       | KES 42,500  |
| KES 100,000    | KES 15,000      | KES 85,000  |

#### Test 3.2: Chama Commission Formula (5%)
**Formula:** Commission = Total × 0.05  
**Formula:** Net Balance = Total - Commission

**Test Cases:**
| Total Collected | Commission (5%) | Net Balance |
|----------------|-----------------|-------------|
| KES 10,000     | KES 500        | KES 9,500   |
| KES 50,000     | KES 2,500      | KES 47,500  |
| KES 100,000    | KES 5,000      | KES 95,000  |
| KES 500,000    | KES 25,000     | KES 475,000 |

#### Test 3.3: Per-Transaction Commission
**Given:** Individual donation/contribution  
**When:** Calculating net amount  
**Then:** Net = Gross × (1 - commission_rate)

**Examples:**
- Mchango donation KES 1,000: Net = 1,000 × 0.85 = KES 850
- Chama contribution KES 2,000: Net = 2,000 × 0.95 = KES 1,900

### 4. UI Display Tests

#### Test 4.1: Color Coding
**Given:** Commission display is shown  
**When:** Viewing the component  
**Then:**
- Total Collected: Standard foreground color
- Commission: Orange/warning color (text-orange-600)
- Net Balance: Primary/green color
- All colors meet accessibility contrast requirements

#### Test 4.2: Icon Display
**Given:** Commission display component  
**When:** Component renders  
**Then:**
- DollarSign icon for Total Collected
- TrendingDown icon for Commission
- Wallet icon for Net Balance
- All icons size h-4 w-4 or h-5 w-5

#### Test 4.3: Responsive Layout
**Given:** Commission display on various screen sizes  
**When:** Viewing on mobile, tablet, and desktop  
**Then:**
- Mobile: Stacks vertically (1 column)
- Tablet/Desktop: Shows 3 columns side by side
- All values remain readable at all sizes

#### Test 4.4: Breakdown Section
**Given:** Commission display with showBreakdown=true  
**When:** Component renders  
**Then:**
- Shows detailed breakdown section
- Lists: Total Collected, minus Commission, equals Net Balance
- Includes note: "Commission is deducted at the time of payout/withdrawal"
- Breakdown has muted background and border

### 5. Integration Tests

#### Test 5.1: Mchango List Page
**Given:** User viewing list of mchangos  
**When:** Each mchango card is displayed  
**Then:**
- Shows total collected (may show net balance optionally)
- Commission info available when clicking details

#### Test 5.2: Chama List Page
**Given:** User viewing list of chamas  
**When:** Each chama card is displayed  
**Then:**
- Shows total collected for members
- Full commission breakdown visible in detail page

#### Test 5.3: Real-time Updates
**Given:** Mchango receives new donation  
**When:** Page auto-refreshes or user refreshes  
**Then:**
- Total Collected updates
- Commission recalculates automatically
- Net Balance updates correctly

### 6. Edge Cases

#### Edge Case 6.1: Very Small Amounts
**Given:** Total collected is KES 10  
**When:** Calculating commission  
**Then:**
- Mchango: Commission = KES 1.50, Net = KES 8.50
- Chama: Commission = KES 0.50, Net = KES 9.50
- Values display with 2 decimal places if needed

#### Edge Case 6.2: Commission Rate = 0
**Given:** Chama with commission_rate = 0  
**When:** Displaying commission  
**Then:**
- Commission (0%): KES 0
- Net Balance equals Total Collected
- No error or division by zero

#### Edge Case 6.3: Null/Undefined Commission Rate
**Given:** Chama without commission_rate set  
**When:** Loading commission display  
**Then:**
- Defaults to 0.05 (5%)
- Falls back gracefully without errors

#### Edge Case 6.4: Decimal Precision
**Given:** Total collected = KES 12,345.67  
**When:** Calculating commission  
**Then:**
- Commission calculated with full precision
- Display rounds to 2 decimal places
- Net balance is accurate

### 7. Commission Status Tests

#### Test 7.1: Commission Not Yet Deducted
**Given:** Funds are still in the pool  
**When:** Viewing commission display  
**Then:**
- Shows "Commission is deducted at the time of payout/withdrawal"
- Indicates commission is pending
- Net balance shown is what will be available after deduction

#### Test 7.2: Post-Payout Display
**Given:** Payout has been processed  
**When:** Viewing transaction history  
**Then:**
- Shows gross amount paid out
- Shows commission deducted
- Shows net amount received by beneficiary

### 8. API Response Tests

#### Test 8.1: Commission Data in Mchango API
```typescript
// Mchango detail response should include:
{
  current_amount: 10000,
  // Frontend calculates:
  // commission: 10000 * 0.15 = 1500
  // net_balance: 10000 - 1500 = 8500
}
```

#### Test 8.2: Commission Data in Chama API
```typescript
// Chama detail response should include:
{
  contribution_amount: 1000,
  commission_rate: 0.05,
  // Total from members calculation
  // Commission and net calculated in frontend
}
```

## Database Verification

### Verify Commission Rate Storage
```sql
-- Check chama commission rates
SELECT 
  id,
  name,
  commission_rate,
  contribution_amount
FROM chama
WHERE id = '{chama_id}';

-- Verify default is 0.05 (5%)
```

### Verify Transaction Totals
```sql
-- Mchango donations total
SELECT 
  SUM(amount) as total_collected,
  SUM(amount) * 0.15 as commission,
  SUM(amount) * 0.85 as net_balance
FROM mchango_donations
WHERE mchango_id = '{mchango_id}'
AND payment_status = 'completed';

-- Chama contributions total
SELECT 
  cm.chama_id,
  c.commission_rate,
  SUM(contrib.amount) as total_collected,
  SUM(contrib.amount) * c.commission_rate as commission,
  SUM(contrib.amount) * (1 - c.commission_rate) as net_balance
FROM contributions contrib
JOIN chama_members cm ON cm.id = contrib.member_id
JOIN chama c ON c.id = cm.chama_id
WHERE cm.chama_id = '{chama_id}'
GROUP BY cm.chama_id, c.commission_rate;
```

## Success Criteria

✅ All Mchango pages display 15% commission correctly  
✅ All Chama pages display 5% commission correctly (or custom rate)  
✅ Net balance = Total - Commission on all pages  
✅ Per-transaction commission shows on donor/contribution lists  
✅ Commission status message displays: "deducted at payout/withdrawal"  
✅ Color coding: orange for commission, primary/green for net balance  
✅ Responsive design works on all screen sizes  
✅ Real-time updates recalculate commission automatically  
✅ No calculation errors with edge cases (zero, decimals, large numbers)  
✅ Commission info only visible to authorized users (members for chama)

## Demo Flow

### Mchango Demo:
1. Create mchango with target KES 100,000
2. Add 5 donations totaling KES 50,000
3. View mchango detail page:
   - Total Collected: KES 50,000
   - Commission (15%): KES 7,500
   - Net Balance: KES 42,500
4. Check donors list - each donation shows net amount after 15% commission
5. Verify breakdown section shows detailed calculation

### Chama Demo:
1. Create chama with KES 1,000 weekly contributions
2. 10 members join and contribute
3. Total collected: KES 10,000
4. View chama detail page (as approved member):
   - Total Collected: KES 10,000
   - Commission (5%): KES 500
   - Net Balance: KES 9,500
5. Verify commission display in member dashboard
6. Check that non-members don't see commission info

## Visual Examples

### Mchango Commission Display:
```
┌─────────────────────────────────────────────┐
│ Balance & Commission                        │
│ 15% commission deducted at payout          │
├─────────────────────────────────────────────┤
│  Total Collected  │ Commission │ Net Balance│
│   KES 50,000      │ KES 7,500  │ KES 42,500 │
│                   │   (15%)    │ Available  │
└─────────────────────────────────────────────┘
```

### Chama Commission Display:
```
┌─────────────────────────────────────────────┐
│ Balance & Commission                        │
│ 5% commission deducted at payout           │
├─────────────────────────────────────────────┤
│  Total Collected  │ Commission │ Net Balance│
│   KES 10,000      │ KES 500    │ KES 9,500  │
│                   │   (5%)     │ Available  │
└─────────────────────────────────────────────┘
```

## Notes

- Commission rates are configured at creation time
- Mchango: Fixed at 15%
- Chama: Stored in commission_rate column (default 5%)
- Commission is calculated but NOT deducted until payout/withdrawal
- All monetary values in Kenyan Shillings (KES)
- Commission display component is reusable for both Mchango and Chama
- Non-members cannot see commission information for private chamas
