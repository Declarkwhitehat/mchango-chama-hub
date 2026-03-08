

## Fix: User Filter Bug in UsersManagement.tsx

The operator precedence in the ternary on lines 267-270 causes "All Status" to only show deleted users. The fix is to use explicit parentheses/if-else logic:

**File: `src/components/admin/UsersManagement.tsx` (lines 267-270)**

Replace the `matchesStatus` logic with:
```typescript
let matchesStatus = true;
if (statusFilter === "all") {
  matchesStatus = true; // show all users
} else if (statusFilter === "deleted") {
  matchesStatus = isDeleted;
} else {
  matchesStatus = !isDeleted && user.kyc_status === statusFilter;
}
```

This ensures:
- "All Status" shows everyone (active + deleted)
- "Deleted" shows only soft-deleted accounts
- "Pending/Approved/Rejected" shows only non-deleted users with that KYC status

