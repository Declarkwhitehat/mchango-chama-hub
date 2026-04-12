

# Plan: Remove PWA, Keep Native App Only

## What Changes

1. **Remove PWA plugin and service worker**
   - Remove `vite-plugin-pwa` from `vite.config.ts` (remove the entire `VitePWA(...)` block)
   - Delete `src/registerSW.ts` and remove its import from `src/main.tsx`
   - Remove the manifest link and PWA meta tags from `index.html` (keep standard favicon/meta)
   - Remove the cache-busting script from `index.html` (no more service workers to clear)

2. **Delete PWAInstallPrompt component**
   - Delete `src/components/PWAInstallPrompt.tsx`
   - Remove its import and usage from `src/App.tsx`

3. **Rename PWA icons to app icons**
   - Rename `public/pwa-192x192.png` → `public/app-icon-192.png`
   - Rename `public/pwa-512x512.png` → `public/app-icon-512.png`
   - Update all references (Index.tsx download section uses `/pwa-192x192.png`)

4. **Fix the Download App section on Index.tsx**
   - Remove the `isPWAInstalled` state and standalone detection logic (lines 28-41) — no longer needed
   - Always show the download section (remove the `!isPWAInstalled` conditional)
   - Update icon src to `/app-icon-192.png`
   - Hide the download section when already inside the native app (detect via Capacitor bridge: `window.Capacitor`)

5. **Clean up dependencies**
   - Remove `vite-plugin-pwa` and `workbox-*` packages from `package.json`

## Files Affected

| Action | File |
|--------|------|
| Edit | `vite.config.ts` — remove VitePWA plugin |
| Edit | `src/main.tsx` — remove registerSW import |
| Delete | `src/registerSW.ts` |
| Delete | `src/components/PWAInstallPrompt.tsx` |
| Edit | `src/App.tsx` — remove PWAInstallPrompt import/usage |
| Edit | `src/pages/Index.tsx` — simplify download section, use app icon |
| Edit | `index.html` — remove PWA manifest link, PWA meta tags, cache script |
| Rename | `public/pwa-192x192.png` → `public/app-icon-192.png` |
| Rename | `public/pwa-512x512.png` → `public/app-icon-512.png` |
| Edit | `package.json` — remove vite-plugin-pwa |

