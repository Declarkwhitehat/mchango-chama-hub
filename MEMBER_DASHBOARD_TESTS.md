# Member Dashboard & Payment Tracking - Acceptance Tests

## Overview
This document outlines acceptance tests for the member dashboard and payment tracking features including overpayment credits, underpayment deficits, and payout schedule calculations.

## Test Scenarios

### 1. Dashboard Display Tests

#### Test 1.1: View Member Dashboard
**Given:** User is an approved member of a Chama  
**When:** User navigates to the Chama detail page  
**Then:** 
- Dashboard tab is visible and active by default
- Member info displays: name, member_code, join_date, order_index
- Current balance shows correctly (credit - deficit)
- Next due date is displayed
- Last payment date is shown

#### Test 1.2: Balance Display
**Given:** Member has balance transactions  
**When:** Dashboard loads  
**Then:**
- Positive balance (credit) shows in green
- Negative balance (deficit) shows in red
- Credit breakdown is visible when credit > 0
- Deficit breakdown is visible when deficit > 0

### 2. Payment Tracking Tests

#### Test 2.1: Overpayment Scenario
**Given:** Member owes KES 200 for current cycle  
**When:** Member pays KES 300  
**Then:**
- Contribution is recorded with amount KES 300
- Member balance_credit increases by KES 100
- Dashboard shows: "Credit: KES 100"
- Info message: "This will be applied to your next contribution"
- Last payment date is updated

#### Test 2.2: Underpayment Scenario
**Given:** Member owes KES 500 for current cycle  
**When:** Member pays KES 300  
**Then:**
- Contribution is recorded with amount KES 300
- Member balance_deficit increases by KES 200
- Dashboard shows: "Deficit: KES 200"
- Warning message: "Please make a payment to clear your deficit"
- Last payment date is updated

#### Test 2.3: Exact Payment
**Given:** Member owes KES 1000 for current cycle  
**When:** Member pays exactly KES 1000  
**Then:**
- Contribution is recorded with amount KES 1000
- No change to balance_credit or balance_deficit
- Last payment date is updated
- Blue tick indicator shows for current cycle

### 3. Payment History Tests

#### Test 3.1: Display Payment History
**Given:** Member has made multiple payments  
**When:** Viewing payment history  
**Then:**
- All contributions are listed in reverse chronological order
- Each entry shows: date, amount, reference, status
- Completed payments show with green "completed" badge
- Pending payments show with secondary badge

#### Test 3.2: Empty Payment History
**Given:** New member with no payments  
**When:** Viewing payment history  
**Then:**
- "No payments yet" message is displayed

### 4. Payout Schedule Tests

#### Test 4.1: Calculate Payout Position
**Given:** Member is approved with order_index = 3 in a 10-member Chama  
**When:** Dashboard loads  
**Then:**
- Position in queue shows: "#3"
- Estimated payout date is calculated based on contribution frequency
- Estimated amount = contribution_amount × member_count

#### Test 4.2: Weekly Payout Calculation
**Given:** 
- Chama has weekly contributions of KES 1000
- Member order_index = 5
- Member joined on Jan 1, 2025
**When:** Dashboard calculates payout schedule  
**Then:**
- Estimated payout date = Jan 1 + (4 × 7 days) = Jan 29, 2025
- Position in queue = 5

### 5. Blue Tick (Paid Status) Tests

#### Test 5.1: Current Cycle Paid
**Given:** Member has paid for the current contribution cycle  
**When:** Dashboard loads  
**Then:**
- Blue tick badge with "Paid This Cycle" is visible
- Badge appears next to member name

#### Test 5.2: Current Cycle Unpaid
**Given:** Member has not paid for current cycle  
**When:** Dashboard loads  
**Then:**
- No blue tick badge is shown
- Next due date is highlighted

### 6. Credit Application Tests

#### Test 6.1: Credit Applied to Next Payment
**Given:** 
- Member has credit of KES 100
- Next contribution due is KES 500
**When:** Member pays KES 400  
**Then:**
- System applies KES 100 credit automatically
- Total contribution recorded as KES 500
- Credit balance reduces to KES 0
- Payment shows as complete with blue tick

### 7. API Integration Tests

#### Test 7.1: Member Dashboard API
```bash
# Request
GET /functions/v1/member-dashboard?chama_id={chamaId}
Authorization: Bearer {token}

# Expected Response
{
  "data": {
    "member": {
      "full_name": "John Doe",
      "member_code": "tech-savers-M003",
      "order_index": 3,
      "balance_credit": 100,
      "balance_deficit": 0,
      "last_payment_date": "2025-01-15",
      "next_due_date": "2025-01-22"
    },
    "chama": {
      "name": "Tech Savers",
      "contribution_amount": 1000,
      "contribution_frequency": "weekly"
    },
    "current_cycle": {
      "is_paid": true,
      "amount_paid": 1100,
      "amount_due": 1000
    },
    "payment_history": [...],
    "payout_schedule": {
      "position_in_queue": 3,
      "estimated_payout_date": "2025-02-05",
      "estimated_amount": 10000
    }
  }
}
```

#### Test 7.2: Contribution with Balance Update
```bash
# Request
POST /functions/v1/contributions-crud
{
  "chama_id": "xxx",
  "member_id": "yyy",
  "amount": 1200,
  "payment_reference": "MPesa-XXX"
}

# Expected Response
{
  "data": {
    "id": "contribution-id",
    "amount": 1200,
    ...
  },
  "balance_update": {
    "credit_added": 200,
    "deficit_added": 0
  }
}
```

## Database Verification

### Verify Member Balance
```sql
SELECT 
  cm.member_code,
  cm.balance_credit,
  cm.balance_deficit,
  cm.last_payment_date,
  cm.next_due_date,
  (cm.balance_credit - cm.balance_deficit) as net_balance
FROM chama_members cm
WHERE cm.id = '{member_id}';
```

### Verify Payment History
```sql
SELECT 
  c.contribution_date,
  c.amount,
  c.payment_reference,
  c.status
FROM contributions c
WHERE c.member_id = '{member_id}'
ORDER BY c.contribution_date DESC;
```

### Verify Payout Position
```sql
SELECT * FROM get_member_payout_position('{member_id}');
```

## Edge Cases

### Edge Case 1: Multiple Overpayments
**Scenario:** Member overpays multiple times  
**Expected:** Credits accumulate and can be used across multiple cycles

### Edge Case 2: Overpayment > Next Due Amount
**Scenario:** Credit of KES 500, next due KES 200  
**Expected:** KES 200 applied, KES 300 remains as credit

### Edge Case 3: First Member (order_index = 1)
**Scenario:** First member receives payout first  
**Expected:** Position #1, earliest payout date

### Edge Case 4: Late Joiner
**Scenario:** Member joins after Chama has been running for months  
**Expected:** Order index assigned, payout scheduled relative to join date

## Success Criteria

✅ All dashboard data loads correctly and displays member information  
✅ Overpayment (300 vs 200 owed) creates KES 100 credit  
✅ Underpayment tracks deficit accurately  
✅ Blue tick appears for paid cycles  
✅ Payment history shows all contributions with correct details  
✅ Payout schedule calculates position and estimated date/amount  
✅ Balance updates persist correctly in database  
✅ Credits apply to next payment automatically  
✅ UI shows appropriate messages for credit/deficit balances

## Demo Flow

1. **Setup:** Create Chama with 5 members, weekly contributions of KES 200
2. **Member joins:** User becomes 3rd member (order_index = 3)
3. **First payment:** Member pays KES 300 (overpayment)
   - Verify credit: KES 100 shown
   - Verify blue tick appears
4. **View dashboard:** Check all data displays correctly
5. **Payment history:** Verify transaction recorded
6. **Payout schedule:** Verify position #3, estimated date/amount
7. **Next payment:** Pay KES 100 (uses KES 100 credit to cover KES 200 due)
   - Verify credit reduces to KES 0
   - Verify payment marked complete

## Notes

- All monetary values are in Kenyan Shillings (KES)
- Blue tick = CheckCircle2 icon from lucide-react
- Payment frequency affects payout schedule calculation
- Member privacy: only approved members see dashboard
- Managers can view all member dashboards
