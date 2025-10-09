# Chama CRUD API Documentation

## Overview
This API manages Chama (savings group) operations including creation, retrieval, updates, and soft deletion. Only KYC-approved users can create chamas.

## Base URL
```
https://ahhcbwbvueimezmtftte.supabase.co/functions/v1/chama-crud
```

## Authentication
All endpoints require authentication via Bearer token in the Authorization header:
```
Authorization: Bearer <your-supabase-token>
```

---

## Endpoints

### 1. Create Chama
**POST** `/chama-crud`

Creates a new chama. Only KYC-approved users can create chamas. The creator is automatically added as the first manager.

#### Request Body
```json
{
  "name": "Women Empowerment Group",
  "description": "A group focused on women's financial empowerment",
  "contribution_amount": 5000,
  "contribution_frequency": "monthly",
  "every_n_days_count": null,
  "min_members": 5,
  "max_members": 20,
  "is_public": true,
  "payout_order": "join_date",
  "commission_rate": 0.05,
  "whatsapp_link": "https://chat.whatsapp.com/..."
}
```

#### Field Descriptions
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `name` | string | Yes | - | Name of the chama group |
| `description` | string | Yes | - | Description of the group's purpose |
| `contribution_amount` | number | Yes | - | Amount each member contributes |
| `contribution_frequency` | enum | Yes | - | Options: `daily`, `weekly`, `monthly`, `every_n_days` |
| `every_n_days_count` | number | Conditional | null | Required if frequency is `every_n_days`. Must be > 0 |
| `min_members` | number | No | 5 | Minimum members required. Must be >= 5 |
| `max_members` | number | Yes | - | Maximum members allowed. Must be <= 100 |
| `is_public` | boolean | No | true | If true, chama is listable. Internal details remain private |
| `payout_order` | enum | No | join_date | Options: `join_date`, `manager_override` |
| `commission_rate` | number | No | 0.05 | Commission rate (5%). Must be between 0 and 1 |
| `whatsapp_link` | string | No | null | WhatsApp group invite link |

#### Validation Rules
- `min_members` must be >= 5
- `max_members` must be <= 100
- `max_members` must be >= `min_members`
- User must have KYC status = 'approved'
- If `contribution_frequency` is `every_n_days`, `every_n_days_count` must be provided and > 0

#### Success Response (201)
```json
{
  "data": {
    "id": "uuid",
    "name": "Women Empowerment Group",
    "slug": "women-empowerment-group",
    "description": "A group focused on women's financial empowerment",
    "contribution_amount": 5000,
    "contribution_frequency": "monthly",
    "every_n_days_count": null,
    "min_members": 5,
    "max_members": 20,
    "is_public": true,
    "payout_order": "join_date",
    "commission_rate": 0.05,
    "status": "active",
    "whatsapp_link": "https://chat.whatsapp.com/...",
    "created_by": "user-uuid",
    "created_at": "2025-10-09T10:00:00Z",
    "updated_at": "2025-10-09T10:00:00Z"
  }
}
```

#### Error Responses

**401 Unauthorized**
```json
{
  "error": "Unauthorized"
}
```

**403 Forbidden (KYC Not Approved)**
```json
{
  "error": "KYC verification required",
  "message": "You must complete KYC verification before creating a chama"
}
```

**400 Bad Request (Validation Error)**
```json
{
  "error": "Minimum members must be at least 5"
}
// OR
{
  "error": "Maximum members cannot exceed 100"
}
// OR
{
  "error": "Maximum members must be greater than minimum members"
}
// OR
{
  "error": "Every N days count must be specified and greater than 0"
}
```

---

### 2. List All Active Chamas
**GET** `/chama-crud`

Retrieves all active chamas with their creator and member information.

#### Success Response (200)
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Women Empowerment Group",
      "slug": "women-empowerment-group",
      "description": "A group focused on women's financial empowerment",
      "contribution_amount": 5000,
      "contribution_frequency": "monthly",
      "every_n_days_count": null,
      "min_members": 5,
      "max_members": 20,
      "is_public": true,
      "payout_order": "join_date",
      "commission_rate": 0.05,
      "status": "active",
      "whatsapp_link": "https://chat.whatsapp.com/...",
      "created_by": "user-uuid",
      "created_at": "2025-10-09T10:00:00Z",
      "updated_at": "2025-10-09T10:00:00Z",
      "profiles": {
        "full_name": "Jane Doe",
        "email": "jane@example.com"
      },
      "chama_members": [
        {
          "id": "member-uuid",
          "member_code": "women-empowerment-M001",
          "is_manager": true,
          "status": "active"
        }
      ]
    }
  ]
}
```

---

### 3. Get Single Chama
**GET** `/chama-crud/:id`

Retrieves a single chama by ID or slug with full details including creator and all members.

#### URL Parameters
- `id`: UUID or slug of the chama

#### Success Response (200)
```json
{
  "data": {
    "id": "uuid",
    "name": "Women Empowerment Group",
    "slug": "women-empowerment-group",
    "description": "A group focused on women's financial empowerment",
    "contribution_amount": 5000,
    "contribution_frequency": "monthly",
    "every_n_days_count": null,
    "min_members": 5,
    "max_members": 20,
    "is_public": true,
    "payout_order": "join_date",
    "commission_rate": 0.05,
    "status": "active",
    "whatsapp_link": "https://chat.whatsapp.com/...",
    "created_by": "user-uuid",
    "created_at": "2025-10-09T10:00:00Z",
    "updated_at": "2025-10-09T10:00:00Z",
    "profiles": {
      "full_name": "Jane Doe",
      "email": "jane@example.com",
      "phone": "+254700000000"
    },
    "chama_members": [
      {
        "id": "member-uuid",
        "user_id": "user-uuid",
        "member_code": "women-empowerment-M001",
        "is_manager": true,
        "joined_at": "2025-10-09T10:00:00Z",
        "status": "active",
        "profiles": {
          "full_name": "Jane Doe",
          "email": "jane@example.com"
        }
      }
    ]
  }
}
```

#### Error Response (404)
```json
{
  "error": "Chama not found"
}
```

---

### 4. Update Chama
**PUT** `/chama-crud/:id`

Updates an existing chama. Only the creator or managers can update.

#### URL Parameters
- `id`: UUID of the chama

#### Request Body
All fields are optional. Only include fields you want to update.

```json
{
  "name": "Updated Group Name",
  "description": "Updated description",
  "contribution_amount": 7000,
  "max_members": 30,
  "whatsapp_link": "https://chat.whatsapp.com/new-link"
}
```

#### Success Response (200)
```json
{
  "data": {
    // Updated chama object
  }
}
```

---

### 5. Delete Chama (Soft Delete)
**DELETE** `/chama-crud/:id`

Soft deletes a chama by setting its status to 'inactive'. Only the creator or managers can delete.

#### URL Parameters
- `id`: UUID of the chama

#### Success Response (200)
```json
{
  "data": {
    // Chama object with status: "inactive"
  }
}
```

---

## RLS Policies

### Chama Table
1. **KYC approved users can create chamas**: Only users with `kyc_status = 'approved'` can insert
2. **Anyone can view active chamas**: Public can view chamas with `status = 'active'`
3. **Users can update their own chamas**: Creators can update their chamas
4. **Chama managers can update chama**: Members with `is_manager = true` can update
5. **Admins can view all chamas**: Admin users can view all chamas

### Automatic Behaviors
- **Slug generation**: Automatically generated from chama name
- **Manager assignment**: Creator is automatically added as first manager via database trigger
- **Member code**: Automatically generated for the first member (format: `SLUG-M001`)

---

## Commission Structure

### Default Commission Rate
- **5%** on total pool before payout (configurable via `commission_rate` field)

### How It Works
When calculating payouts:
1. Total Pool Amount = Sum of all contributions
2. Commission Amount = Total Pool × Commission Rate (0.05 or 5%)
3. Net Payout Amount = Total Pool - Commission Amount

**Example:**
- Total contributions: KES 100,000
- Commission (5%): KES 5,000
- Net available for payout: KES 95,000

---

## Example Usage

### Create a Chama (cURL)
```bash
curl -X POST https://ahhcbwbvueimezmtftte.supabase.co/functions/v1/chama-crud \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Tech Savers",
    "description": "Saving for tech equipment upgrades",
    "contribution_amount": 10000,
    "contribution_frequency": "monthly",
    "min_members": 5,
    "max_members": 15,
    "is_public": true,
    "payout_order": "join_date"
  }'
```

### Create with Every N Days Frequency
```bash
curl -X POST https://ahhcbwbvueimezmtftte.supabase.co/functions/v1/chama-crud \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Bi-Weekly Savers",
    "description": "Contributions every 14 days",
    "contribution_amount": 3000,
    "contribution_frequency": "every_n_days",
    "every_n_days_count": 14,
    "min_members": 5,
    "max_members": 20,
    "is_public": true
  }'
```

### JavaScript Example
```javascript
import { supabase } from "@/integrations/supabase/client";

async function createChama() {
  const { data, error } = await supabase.functions.invoke("chama-crud", {
    body: {
      name: "Women Empowerment Group",
      description: "A group focused on women's financial empowerment",
      contribution_amount: 5000,
      contribution_frequency: "monthly",
      min_members: 5,
      max_members: 20,
      is_public: true,
      payout_order: "join_date",
    },
    method: "POST",
  });

  if (error) {
    console.error("Error:", error);
    return;
  }

  console.log("Chama created:", data.data);
}
```
