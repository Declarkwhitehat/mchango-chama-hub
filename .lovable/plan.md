
# Plan: Convert PWA to Native Mobile App with Capacitor

## Overview
Transform your Chama & Mchango PWA into a true native mobile application that can be published to the Apple App Store and Google Play Store using Capacitor.

---

## What You'll Get
- A real native app for iPhone and Android
- Full access to phone features (camera, push notifications, etc.)
- App store distribution capability
- Live reload during development (test changes instantly on your phone)
- Your existing web code wrapped in a native container

---

## Implementation Steps

### Step 1: Install Capacitor Dependencies
Add the required Capacitor packages to your project:
- `@capacitor/core` - Core runtime
- `@capacitor/cli` - Command line tools (dev only)
- `@capacitor/ios` - iOS platform support
- `@capacitor/android` - Android platform support

### Step 2: Create Capacitor Configuration
Create a `capacitor.config.ts` file with:
- **App ID**: `app.lovable.8a71b0bc5b9c4a2f9a0f1a31cc216d64`
- **App Name**: `mchango-chama-hub`
- **Web Directory**: `dist` (where Vite outputs the build)
- **Live Reload Server**: Points to your Lovable preview URL for hot-reloading during development

### Step 3: Add Build Scripts
Update `package.json` with convenient scripts:
- `cap:sync` - Sync web assets to native projects
- `cap:android` - Run on Android emulator/device
- `cap:ios` - Run on iOS simulator/device

---

## After I Make These Changes

You'll need to complete these steps on your local machine:

1. **Export to GitHub**: Click "Export to GitHub" in Lovable to transfer the project
2. **Clone & Install**: 
   ```bash
   git clone <your-repo-url>
   cd <project-folder>
   npm install
   ```
3. **Add Native Platforms**:
   ```bash
   npx cap add ios      # For iPhone
   npx cap add android  # For Android
   ```
4. **Build & Sync**:
   ```bash
   npm run build
   npx cap sync
   ```
5. **Run on Device/Emulator**:
   ```bash
   npx cap run ios      # Requires Mac with Xcode
   npx cap run android  # Requires Android Studio
   ```

---

## Requirements for App Store Publishing
- **iOS**: Mac computer with Xcode, Apple Developer account ($99/year)
- **Android**: Android Studio, Google Play Developer account ($25 one-time)

---

## Technical Details

### Files to Create
| File | Purpose |
|------|---------|
| `capacitor.config.ts` | Capacitor configuration with app ID, name, and server settings |

### Files to Modify
| File | Changes |
|------|---------|
| `package.json` | Add Capacitor dependencies and build scripts |

### Configuration Values
```text
App ID:     app.lovable.8a71b0bc5b9c4a2f9a0f1a31cc216d64
App Name:   mchango-chama-hub
Web Dir:    dist
Server URL: https://8a71b0bc-5b9c-4a2f-9a0f-1a31cc216d64.lovableproject.com?forceHideBadge=true
```

---

## Helpful Resources
After implementation, I recommend reading the [Capacitor Mobile Development Guide](https://docs.lovable.dev/mobile/capacitor) for detailed instructions on building, testing, and publishing your native app.

