# Advanced Admin Panel Features

## Overview
This document details the advanced search filters and bulk actions implemented in the admin panel for better data management.

## ✅ Completed Components

### 1. Advanced Filters Component (`src/components/admin/AdvancedFilters.tsx`)
A comprehensive filtering system with:
- **Date Range Filtering**: Calendar-based date selection (from/to dates)
- **Status Filters**: Multiple status selections (pending, approved, rejected, active, etc.)
- **KYC Status Filters**: Specific KYC status filtering
- **Role Filters**: Filter by user roles (admin, user)
- **Amount Range**: Min/max amount filtering for transactions/campaigns
- **Search Field Selector**: Choose which fields to search in
- **Active Filter Tags**: Visual display of active filters with quick removal
- **Filter Count Badge**: Shows number of active filters

### 2. Bulk Actions Component (`src/components/admin/BulkActions.tsx`)
Powerful bulk operations with:
- **Checkbox Selection**: Select individual items or all items at once
- **Selection Count Display**: Clear indication of how many items selected
- **Configurable Actions**: Pass custom actions with icons and variants
- **Confirmation Dialogs**: Optional confirmation for destructive actions
- **Processing States**: Loading indicators during bulk operations
- **Quick Clear**: One-click to clear all selections
- **Custom Bulk Action Definitions**: Each action can have:
  - Custom label and icon
  - Visual variant (default, destructive, secondary)
  - Confirmation requirement
  - Custom confirmation title and description

### 3. Bulk Selection Hook (`useBulkSelection`)
Reusable React hook for managing bulk selection state:
```typescript
const { 
  selectedIds,          // Array of selected IDs
  toggleSelection,      // Toggle individual item
  selectAll,           // Select/deselect all
  clearSelection,      // Clear all selections
  isSelected          // Check if item is selected
} = useBulkSelection(items);
```

## 📦 Implementation Details

### Filter Configuration Interface
```typescript
interface FilterConfig {
  dateFrom?: Date;
  dateTo?: Date;
  status?: string[];
  minAmount?: number;
  maxAmount?: number;
  kycStatus?: string[];
  role?: string[];
  searchField?: string;
}
```

###Bulk Action Interface
```typescript
interface BulkAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  variant?: "default" | "destructive" | "secondary";
  confirmRequired?: boolean;
  confirmTitle?: string;
  confirmDescription?: string;
}
```

## 🎯 Use Cases

### Example 1: KYC Management with Bulk Approval
```typescript
const bulkActions: BulkAction[] = [
  {
    id: 'approve',
    label: 'Approve Selected',
    icon: <CheckCircle className="h-4 w-4" />,
    variant: 'default',
    confirmRequired: true,
    confirmTitle: 'Approve Selected KYC Submissions',
    confirmDescription: 'Approve all selected KYC submissions?',
  },
  {
    id: 'reject',
    label: 'Reject Selected',
    icon: <XCircle className="h-4 w-4" />,
    variant: 'destructive',
    confirmRequired: true,
  },
];
```

### Example 2: Campaign Management with Filters
```typescript
<AdvancedFilters
  onFilterChange={setFilters}
  filterOptions={{
    statuses: [
      { value: 'active', label: 'Active' },
      { value: 'completed', label: 'Completed' },
      { value: 'cancelled', label: 'Cancelled' },
    ],
    showAmountRange: true,
    showDateRange: true,
  }}
/>
```

### Example 3: User Management with Role Filters
```typescript
<AdvancedFilters
  onFilterChange={setFilters}
  filterOptions={{
    kycStatuses: [
      { value: 'pending', label: 'Pending' },
      { value: 'approved', label: 'Approved' },
      { value: 'rejected', label: 'Rejected' },
    ],
    roles: [
      { value: 'admin', label: 'Admin' },
      { value: 'user', label: 'User' },
    ],
    showDateRange: true,
  }}
/>
```

## 🔧 Integration Steps

### Step 1: Import Components
```typescript
import { AdvancedFilters, FilterConfig } from "@/components/admin/AdvancedFilters";
import { BulkActions, BulkAction, useBulkSelection } from "@/components/admin/BulkActions";
```

### Step 2: Setup State
```typescript
const [filters, setFilters] = useState<FilterConfig>({});
const [filteredData, setFilteredData] = useState([]);
const { selectedIds, toggleSelection, selectAll, clearSelection, isSelected } = useBulkSelection(filteredData);
```

### Step 3: Apply Filters
```typescript
const applyFilters = () => {
  let filtered = [...data];
  
  if (filters.status && filters.status.length > 0) {
    filtered = filtered.filter(item => filters.status?.includes(item.status));
  }
  
  if (filters.dateFrom) {
    filtered = filtered.filter(item => 
      new Date(item.created_at) >= filters.dateFrom!
    );
  }
  
  // ... more filter logic
  
  setFilteredData(filtered);
};
```

### Step 4: Handle Bulk Actions
```typescript
const handleBulkAction = async (actionId: string, ids: string[]) => {
  switch (actionId) {
    case 'approve':
      // Approve logic for selected IDs
      for (const id of ids) {
        await approveItem(id);
      }
      break;
    case 'delete':
      // Delete logic for selected IDs
      await deleteItems(ids);
      break;
  }
  clearSelection();
};
```

### Step 5: Render UI
```typescript
<div className="space-y-4">
  <AdvancedFilters
    onFilterChange={setFilters}
    filterOptions={{
      statuses: [...],
      showDateRange: true,
      showAmountRange: true,
    }}
  />
  
  <BulkActions
    selectedIds={selectedIds}
    totalCount={filteredData.length}
    onSelectAll={selectAll}
    onClearSelection={clearSelection}
    actions={bulkActions}
    onAction={handleBulkAction}
  />
  
  {/* Render table/list with checkboxes */}
  {filteredData.map(item => (
    <div key={item.id}>
      <Checkbox
        checked={isSelected(item.id)}
        onCheckedChange={() => toggleSelection(item.id)}
      />
      {/* Item content */}
    </div>
  ))}
</div>
```

## 🎨 UI Features

### Filter Tags
Active filters are displayed as removable badges:
- Date range: "From: Jan 1, 2024"
- Status: "Status: Active"
- Amount: "Amount: 1000 - 5000"
- Each tag has an X button for quick removal

### Selection Display
When items are selected:
- Shows count badge: "5 selected"
- Displays all bulk action buttons
- "Clear" button to deselect all
- Checkbox shows indeterminate state when some (not all) selected

### Confirmation Dialogs
For destructive actions:
- Custom title and description
- Cancel/Confirm buttons
- Loading state during processing
- Prevents accidental bulk deletions

## 📊 Benefits

1. **Efficiency**: Process multiple items simultaneously
2. **User Experience**: Clear visual feedback for selections and filters
3. **Safety**: Confirmation dialogs prevent mistakes
4. **Flexibility**: Reusable across different admin sections
5. **Performance**: Filtered data reduces render load
6. **Accessibility**: Proper ARIA labels and keyboard navigation

## 🔄 Future Enhancements

- [ ] Save filter presets
- [ ] Export filtered results to CSV
- [ ] Advanced query builder UI
- [ ] Batch scheduling for bulk actions
- [ ] Undo/redo for bulk operations
- [ ] Multi-step bulk wizards
- [ ] Real-time filter suggestions
- [ ] Filter history/recently used

## 📁 Files Created

1. `src/components/admin/AdvancedFilters.tsx` - Main filter component
2. `src/components/admin/BulkActions.tsx` - Bulk operations component with hook
3. Updated `src/pages/AdminKYC.tsx` - Integrated filters and bulk actions

## 🧪 Testing Checklist

- [ ] Filter by single criterion
- [ ] Filter by multiple criteria simultaneously
- [ ] Date range filtering
- [ ] Amount range filtering
- [ ] Select individual items
- [ ] Select all items
- [ ] Deselect items
- [ ] Perform bulk action
- [ ] Confirm dangerous bulk action
- [ ] Cancel bulk action
- [ ] Clear active filters
- [ ] View active filter tags
- [ ] Remove individual filter tags
