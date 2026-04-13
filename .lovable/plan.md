

# Plan: Fix Sitemap for Google Search Console

## Root Cause

Google Search Console is receiving HTML instead of XML when fetching the sitemap. This happens because:
- The `public/sitemap.xml` static file gets intercepted by the SPA's catch-all routing, returning `index.html` (an HTML page)
- The `robots.txt` references the internal backend URL instead of `pamojanova.online`

## Solution

### 1. Update `robots.txt` — use `pamojanova.online` domain
Change the Sitemap directive from the internal URL to:
```
Sitemap: https://pamojanova.online/sitemap.xml
```

### 2. Ensure `public/sitemap.xml` is served correctly
The static file in `public/` should be served as-is by the hosting provider. Verify the existing `public/sitemap.xml` has valid XML content (it does).

### 3. Add `_headers` or hosting config (if needed)
If the hosting still serves it as HTML, we can add a Netlify/Vercel-style `_headers` file or a `_redirects` file to force the correct content type. However, most hosts serve `.xml` files with `application/xml` by default.

### 4. Keep the edge function as a backup
The edge function at `/functions/v1/sitemap` will remain as a reliable fallback since it explicitly sets `Content-Type: application/xml`.

## Files Changed

| Action | File |
|--------|------|
| Edit | `public/robots.txt` — update Sitemap URL to pamojanova.online |

## What to do in Google Search Console

After the change deploys, submit this sitemap URL in Google Search Console:
- **Primary**: `https://pamojanova.online/sitemap.xml`
- **Fallback** (if static still fails): `https://ahhcbwbvueimezmtftte.supabase.co/functions/v1/sitemap`

