# Mchango Public Listing & Search - Testing Guide

## Overview
This document provides testing instructions for the Mchango public listing and search functionality.

## Feature Deliverables
✅ Public listing page at `/mchango`
✅ Search by title, slug
✅ Sorting: newest, most-funded, ending-soon
✅ Progress bars and Donate buttons
✅ SEO-friendly slug-based URLs: `/mchango/{slug}`
✅ Postman API tests

## Manual Testing

### 1. Public Listing Page
**URL:** `/mchango`

**Test Steps:**
1. Navigate to `/mchango` without authentication
2. Verify all active public campaigns are displayed
3. Verify each campaign card shows:
   - Title
   - Category badge
   - Days left badge
   - Description snippet
   - Progress bar
   - Raised amount vs target amount
   - "Donate Now" button

**Expected Result:** All campaigns display correctly with progress indicators

### 2. Search Functionality
**Location:** Search input on `/mchango` page

**Test Cases:**
1. Search by title:
   - Enter "Medical" in search
   - Verify only campaigns with "Medical" in title appear
   
2. Search by slug:
   - Enter slug (e.g., "medical-emergency")
   - Verify matching campaign appears
   
3. Empty search:
   - Clear search field
   - Verify all campaigns reappear

**Expected Result:** Search filters campaigns in real-time

### 3. Sorting Functionality
**Location:** Sort dropdown on `/mchango` page

**Test Cases:**
1. Sort by "Newest First":
   - Select "Newest First" from dropdown
   - Verify campaigns are ordered by creation date (newest first)
   
2. Sort by "Most Funded":
   - Select "Most Funded" from dropdown
   - Verify campaigns are ordered by current_amount (highest first)
   
3. Sort by "Ending Soon":
   - Select "Ending Soon" from dropdown
   - Verify campaigns are ordered by end_date (soonest first)

**Expected Result:** Campaigns reorder correctly based on sort option

### 4. Campaign Detail Page (Slug-based)
**URL:** `/mchango/{slug}`

**Test Steps:**
1. Click on any campaign from listing page
2. Verify URL changes to `/mchango/{slug}` (not ID)
3. Verify campaign details load:
   - Title
   - Category
   - Days remaining
   - Full description
   - Progress bar
   - Contribution form
   - Share button

**Expected Result:** Campaign loads via slug, shows complete details

### 5. Share Functionality
**Location:** Share button on campaign detail page

**Test Steps:**
1. Click share button
2. Verify toast shows "Link copied to clipboard"
3. Paste clipboard content
4. Verify URL format: `{site-url}/mchango/{slug}`

**Expected Result:** Shareable SEO-friendly link is copied

### 6. Responsive Design
**Test all screen sizes:**
- Desktop (1920px)
- Tablet (768px)
- Mobile (375px)

**Verify:**
- Campaign grid adjusts (3 cols → 2 cols → 1 col)
- Search and sort controls remain usable
- Campaign cards remain readable

## API Testing with Postman

### Setup
1. Import `POSTMAN_COLLECTION.json` into Postman
2. Set collection variables:
   - `base_url`: Your Supabase project URL
   - `anon_key`: Your Supabase anon key
   - `user_token`: (Will be set after authentication)

### Test Scenarios

#### 1. Get All Public Mchangos (Newest)
```
GET {{base_url}}/functions/v1/mchango-crud?sort=newest
Headers: 
  apikey: {{anon_key}}
```
**Expected:** 200 OK, array of mchangos sorted by created_at DESC

#### 2. Get All Public Mchangos (Most Funded)
```
GET {{base_url}}/functions/v1/mchango-crud?sort=most-funded
Headers:
  apikey: {{anon_key}}
```
**Expected:** 200 OK, array sorted by current_amount DESC

#### 3. Get All Public Mchangos (Ending Soon)
```
GET {{base_url}}/functions/v1/mchango-crud?sort=ending-soon
Headers:
  apikey: {{anon_key}}
```
**Expected:** 200 OK, array sorted by end_date ASC

#### 4. Search Mchangos
```
GET {{base_url}}/functions/v1/mchango-crud?search=medical
Headers:
  apikey: {{anon_key}}
```
**Expected:** 200 OK, filtered results containing "medical"

#### 5. Get Mchango by Slug
```
GET {{base_url}}/functions/v1/mchango-crud?slug=medical-emergency
Headers:
  apikey: {{anon_key}}
```
**Expected:** 200 OK, single mchango object

#### 6. Create Mchango (Requires Auth + KYC)
```
POST {{base_url}}/functions/v1/mchango-crud
Headers:
  apikey: {{anon_key}}
  Authorization: Bearer {{user_token}}
  Content-Type: application/json
Body:
{
  "title": "Test Campaign",
  "description": "Test description",
  "target_amount": 50000,
  "category": "Medical",
  "end_date": "2025-12-31",
  "is_public": true
}
```
**Expected:** 201 Created, returns new mchango with auto-generated slug

## Database Verification

### Check Active Public Campaigns
```sql
SELECT id, title, slug, status, is_public, current_amount, target_amount, created_at
FROM mchango
WHERE status = 'active' AND is_public = true
ORDER BY created_at DESC;
```

### Verify Slug Generation
```sql
SELECT title, slug FROM mchango;
```
**Expected:** All mchangos have unique, URL-friendly slugs

### Check RLS Policies
```sql
-- Verify public can view active public mchangos
SELECT * FROM mchango WHERE status = 'active' AND is_public = true;
```

## SEO Verification

### Check URL Structure
1. Visit `/mchango/{slug}` directly
2. Verify page loads without authentication
3. Check browser address bar shows clean slug URL
4. Verify page title contains campaign title
5. Check meta description if implemented

### Social Sharing
1. Share URL on social platform
2. Verify preview shows campaign info
3. Check Open Graph tags if implemented

## Performance Testing

### Load Testing
1. Create 50+ test campaigns
2. Navigate to `/mchango`
3. Measure initial load time
4. Test search with various queries
5. Switch between sort options

**Expected:** Page remains responsive (<2s load)

## Acceptance Criteria
- ✅ Public listing accessible at `/mchango` without auth
- ✅ Search filters by title and slug
- ✅ Sorting works for all 3 options
- ✅ Campaign cards show progress bars
- ✅ Clicking campaign navigates to `/mchango/{slug}`
- ✅ Share link uses slug format
- ✅ Postman tests pass for all endpoints
- ✅ Responsive on all screen sizes

## Known Issues & Limitations
- Payment integration is placeholder (TODO)
- Recent contributions section removed (will be added with transactions)
- Contributors count not yet implemented

## Next Steps
1. Implement M-Pesa STK Push integration
2. Add transactions tracking
3. Implement contributors list
4. Add Open Graph meta tags for social sharing
5. Add sitemap for SEO
