# Mchango CRUD API Documentation

## Overview
The Mchango CRUD API allows KYC-approved users to create, read, update, and delete fundraising campaigns (Mchangos). Only users with approved KYC status can create mchangos.

## Base URL
```
https://ahhcbwbvueimezmtftte.supabase.co/functions/v1/mchango-crud
```

## Authentication
All endpoints (except public GET) require a valid JWT token in the Authorization header:
```
Authorization: Bearer <jwt-token>
```

## Endpoints

### 1. List All Active Mchangos
**GET** `/mchango-crud`

Returns all active public mchangos. If authenticated, also returns user's private mchangos.

**Headers:**
```
Authorization: Bearer <jwt-token> (optional)
```

**Response (200):**
```json
{
  "data": [
    {
      "id": "uuid",
      "title": "Medical Fund for Jane",
      "description": "Help Jane with her medical expenses",
      "slug": "medical-fund-for-jane",
      "target_amount": 500000,
      "current_amount": 150000,
      "end_date": "2025-12-31T23:59:59Z",
      "beneficiary_url": "https://example.com/jane",
      "whatsapp_link": "https://wa.me/254700000000",
      "category": "medical",
      "is_public": true,
      "managers": ["uuid1", "uuid2"],
      "status": "active",
      "created_by": "uuid",
      "created_at": "2025-01-01T00:00:00Z",
      "updated_at": "2025-01-01T00:00:00Z",
      "image_url": "https://...",
      "profiles": {
        "full_name": "John Doe",
        "email": "john@example.com"
      }
    }
  ]
}
```

### 2. Get Single Mchango by ID or Slug
**GET** `/mchango-crud/{id_or_slug}`

Returns a single mchango by its UUID or slug.

**Parameters:**
- `id_or_slug` (path) - Mchango UUID or unique slug

**Response (200):**
```json
{
  "data": {
    "id": "uuid",
    "title": "Medical Fund for Jane",
    "description": "Help Jane with her medical expenses",
    "slug": "medical-fund-for-jane",
    "target_amount": 500000,
    "current_amount": 150000,
    "end_date": "2025-12-31T23:59:59Z",
    "beneficiary_url": "https://example.com/jane",
    "whatsapp_link": "https://wa.me/254700000000",
    "category": "medical",
    "is_public": true,
    "managers": ["uuid1"],
    "status": "active",
    "created_by": "uuid",
    "created_at": "2025-01-01T00:00:00Z",
    "updated_at": "2025-01-01T00:00:00Z",
    "image_url": "https://...",
    "profiles": {
      "full_name": "John Doe",
      "email": "john@example.com",
      "phone": "+254700000000"
    }
  }
}
```

**Response (404):**
```json
{
  "error": "Mchango not found"
}
```

### 3. Create New Mchango
**POST** `/mchango-crud`

Creates a new fundraising campaign. **Requires KYC-approved status.**

**Headers:**
```
Authorization: Bearer <jwt-token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "title": "Medical Fund for Jane",
  "description": "Help Jane with her medical expenses",
  "target_amount": 500000,
  "end_date": "2025-12-31T23:59:59Z",
  "beneficiary_url": "https://example.com/jane",
  "whatsapp_link": "https://wa.me/254700000000",
  "category": "medical",
  "is_public": true,
  "managers": ["uuid1", "uuid2"],
  "image_url": "https://...",
  "slug": "medical-fund-jane" // Optional, auto-generated from title if not provided
}
```

**Field Descriptions:**
- `title` (required) - Campaign title
- `description` (optional) - Campaign description
- `target_amount` (required) - Target fundraising amount in KES
- `end_date` (optional) - Campaign end date
- `beneficiary_url` (optional) - URL to beneficiary information
- `whatsapp_link` (optional) - WhatsApp contact link
- `category` (optional) - Campaign category
- `is_public` (optional, default: true) - Whether campaign is publicly visible
- `managers` (optional) - Array of user UUIDs (max 2 additional managers)
- `image_url` (optional) - Campaign image URL
- `slug` (optional) - Unique URL slug, auto-generated if not provided

**Response (201):**
```json
{
  "data": {
    "id": "uuid",
    "title": "Medical Fund for Jane",
    "slug": "medical-fund-for-jane",
    "target_amount": 500000,
    "current_amount": 0,
    "status": "active",
    "created_by": "uuid",
    "created_at": "2025-01-01T00:00:00Z",
    ...
  }
}
```

**Response (400):**
```json
{
  "error": "Missing required fields: title, target_amount"
}
```

**Response (403):**
```json
{
  "error": "KYC verification required",
  "message": "Only KYC-approved users can create mchangos. Please complete your KYC verification first.",
  "kyc_status": "pending"
}
```

### 4. Update Mchango
**PUT** `/mchango-crud/{id}`

Updates an existing mchango. Only creator and managers can update.

**Headers:**
```
Authorization: Bearer <jwt-token>
Content-Type: application/json
```

**Parameters:**
- `id` (path) - Mchango UUID

**Request Body:**
```json
{
  "title": "Updated title",
  "description": "Updated description",
  "target_amount": 600000,
  "is_public": false
}
```

**Response (200):**
```json
{
  "data": {
    "id": "uuid",
    "title": "Updated title",
    ...
  }
}
```

### 5. Delete Mchango (Soft Delete)
**DELETE** `/mchango-crud/{id}`

Soft deletes a mchango by setting status to 'cancelled'. Only creator can delete.

**Headers:**
```
Authorization: Bearer <jwt-token>
```

**Parameters:**
- `id` (path) - Mchango UUID

**Response (200):**
```json
{
  "data": {
    "id": "uuid",
    "status": "cancelled",
    ...
  }
}
```

## Slug Generation
- Slugs are automatically generated from the title
- Format: lowercase, alphanumeric + hyphens only
- Uniqueness: If slug exists, timestamp is appended
- Example: "Help Jane" → "help-jane" → "help-jane-1735689600000" (if duplicate)

## Business Rules

### KYC Requirements
- Only users with `kyc_status = 'approved'` can create mchangos
- KYC check is enforced at both database (RLS) and application (edge function) levels

### Managers
- Creator is automatically a manager (don't include in managers array)
- Max 2 additional managers allowed
- Managers have full update permissions
- Validated at database level via trigger

### Visibility
- Public mchangos (`is_public = true`) visible to everyone
- Private mchangos only visible to creator and managers
- Unauthenticated users only see public mchangos

## Error Codes
- `400` - Bad Request (missing/invalid fields)
- `401` - Unauthorized (missing/invalid JWT)
- `403` - Forbidden (KYC not approved, not creator/manager)
- `404` - Not Found (mchango doesn't exist)
- `500` - Internal Server Error

## Rate Limiting
Standard Supabase rate limits apply. Contact support for higher limits.

## Testing

### Test Slug Uniqueness
```bash
# Create first mchango
curl -X POST https://ahhcbwbvueimezmtftte.supabase.co/functions/v1/mchango-crud \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test Campaign",
    "target_amount": 10000
  }'

# Create duplicate (slug will have timestamp appended)
curl -X POST https://ahhcbwbvueimezmtftte.supabase.co/functions/v1/mchango-crud \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test Campaign",
    "target_amount": 10000
  }'
```

### Test KYC Requirement
```bash
# Try to create without KYC approval (should fail with 403)
curl -X POST https://ahhcbwbvueimezmtftte.supabase.co/functions/v1/mchango-crud \
  -H "Authorization: Bearer <token-without-kyc>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "My Campaign",
    "target_amount": 50000
  }'
```

### Access by Slug
```bash
# Access mchango by slug
curl https://ahhcbwbvueimezmtftte.supabase.co/functions/v1/mchango-crud/medical-fund-for-jane
```

## See Also
- [M-PESA Integration](MPESA_SETUP.md)
- [OpenAPI Specification](OPENAPI_SPEC.yaml)
- [Postman Collection](POSTMAN_COLLECTION.json)
