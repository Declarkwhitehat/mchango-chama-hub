
Root cause (based on your answers + code review):
- This is mainly a caching/service-worker issue in the preview environment.
- In `src/registerSW.ts`, mobile mode is detected with `window.innerWidth <= 768`.  
  In the editor preview pane, width is often narrow, so it gets treated like mobile and registers PWA caching.
- Result: preview can serve older cached assets/pages, so deleted/updated content appears again intermittently.

Implementation plan (professional fix):
1. Harden service-worker registration logic (`src/registerSW.ts`)
   - Register SW only when truly appropriate (real mobile/PWA context), not just because preview pane is narrow.
   - Add explicit preview-host guard (do not register SW on preview URL).
   - On preview/desktop, force cleanup:
     - unregister all service workers
     - clear workbox/app caches
   - This guarantees preview always reflects latest code.

2. Align install prompt behavior (`src/components/PWAInstallPrompt.tsx`)
   - Apply the same “no PWA in preview” guard so preview never behaves like installable PWA.
   - Keep install prompt only for real user-facing environment.

3. Stabilize stale-load behavior (`vite.config.ts`, PWA workbox section)
   - Tighten navigation caching policy to avoid stale HTML in uncertain network moments.
   - Keep asset caching for performance, but prevent old shell from being shown in preview-like conditions.

4. Verification checklist
   - Open preview `/` repeatedly and confirm no old “saving group” text reappears.
   - Resize preview pane below 768px and verify still no SW registration.
   - Confirm published app still supports PWA flow where intended.
   - Confirm hard refresh is no longer needed to see latest edits.

Technical details:
- Files to update:
  - `src/registerSW.ts` (primary fix)
  - `src/components/PWAInstallPrompt.tsx` (consistency fix)
  - `vite.config.ts` (cache policy hardening)
- Key logic change:
  - replace width-based mobile trigger as sole condition
  - add environment/hostname guards for preview
  - add proactive SW + Cache Storage cleanup when preview/desktop is detected
- Expected outcome:
  - Preview becomes “always fresh”
  - Intermittent reappearance of old UI stops
  - PWA caching remains available only where it should be
