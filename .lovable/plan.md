

# Fix PWA Install Flow & Update Branding to "Pamoja"

## Problem
1. The "Install App" button on the homepage dispatches a fake `beforeinstallprompt` event, which the browser ignores -- only the browser can fire that event. It should dispatch `triggerPWAInstall` to trigger the saved prompt.
2. The homepage still says "Install Our Progressive Web App" instead of "Install Pamoja App".
3. When the browser's install prompt isn't available (e.g., already installed, unsupported browser, or viewing in an iframe), clicking "Install" does nothing with no feedback to the user.

## Changes

### 1. Fix Index.tsx - Homepage Install Section
- Change heading from "Install Our Progressive Web App" to "Install Pamoja App"
- Fix the button's `onClick` to dispatch `triggerPWAInstall` custom event instead of faking `beforeinstallprompt`
- Add a fallback: if the native prompt isn't available, show the user manual install instructions (e.g., "Use your browser menu > Add to Home Screen")

### 2. Improve PWAInstallPrompt.tsx - Better Install Handling
- When "Install" is clicked but `deferredPrompt` is null, show a toast with manual install instructions instead of silently doing nothing
- This covers Safari (iOS), Firefox, and other browsers that don't support `beforeinstallprompt`
- The toast will say something like: "To install, tap the share/menu button in your browser and select 'Add to Home Screen'"

## Technical Details

**Index.tsx** (line 267 and 277-280):
- Update heading text to "Install Pamoja App"
- Change onClick from `new Event('beforeinstallprompt')` to `new Event('triggerPWAInstall')`
- Add fallback behavior using a toast notification for unsupported browsers

**PWAInstallPrompt.tsx** (line 69-70):
- In `handleInstall`, when `deferredPrompt` is null, show a toast with manual installation instructions instead of silently returning
- Import and use `toast` from sonner

