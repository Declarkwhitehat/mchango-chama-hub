

## Plan: Restrict PWA to Mobile Only — No Service Worker or Install on Desktop

### What Changes

The PWA (service worker registration, caching, install prompt) will only activate on mobile devices. Desktop browsers will get the regular web app with no PWA features.

### Specific Changes

**`src/registerSW.ts`** — Wrap the entire service worker registration in a mobile device check:
- Check `navigator.userAgent` for mobile patterns AND `window.innerWidth <= 768`
- If desktop: skip `registerSW()` entirely, and unregister any existing service workers (cleanup for users who previously had it installed on desktop)
- If mobile: register as normal

**`src/components/PWAInstallPrompt.tsx`** — Already has a mobile check (from the last edit), no changes needed.

**`vite.config.ts`** — No changes. The manifest and workbox config stay — they're just static files. The runtime guard in `registerSW.ts` prevents desktop from using them.

### Technical Details

- The mobile check uses the same pattern already in `PWAInstallPrompt.tsx`: user agent regex + viewport width
- On desktop, any previously registered service workers will be unregistered to clean up stale caches
- The manifest file will still be served (it's just a JSON file) but won't matter since no service worker will be active on desktop

