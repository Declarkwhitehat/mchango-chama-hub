

# Plan: Complete SEO for Google Search Console — pamojanova.online

## Issues Found

1. **Canonical URL** → points to `mchango-chama-hub.lovable.app` instead of `pamojanova.online`
2. **Open Graph URL** → same wrong domain
3. **OG/Twitter images** → generic Lovable placeholder, not your own branding
4. **No sitemap.xml** → Google Search Console requires this for indexing
5. **robots.txt missing Sitemap directive** → crawlers can't discover sitemap
6. **No Organization schema** (JSON-LD) → missing structured data for rich results
7. **No WebApplication schema** → helps Google understand the app
8. **Missing og:site_name, og:locale** → incomplete Open Graph
9. **No favicon `<link>`** in head

## Changes

### 1. Update `index.html`
- Change canonical to `https://pamojanova.online/`
- Fix all OG/Twitter URLs to `pamojanova.online`
- Use `/app-icon-512.png` as OG/Twitter image (your own icon)
- Add `og:site_name`, `og:locale`
- Add Organization + WebApplication JSON-LD schemas
- Add favicon link tag

### 2. Create `public/sitemap.xml`
- List all public routes: `/`, `/about`, `/terms`, `/privacy`, `/mchango`, `/chama`, `/welfare`, `/auth`
- Use `pamojanova.online` as base URL
- Set appropriate `changefreq` and `priority`

### 3. Update `public/robots.txt`
- Add `Sitemap: https://pamojanova.online/sitemap.xml`
- Keep existing allow rules

### Files Changed

| Action | File |
|--------|------|
| Edit | `index.html` — fix URLs, add schemas, add favicon |
| Create | `public/sitemap.xml` |
| Edit | `public/robots.txt` — add sitemap directive |

