import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'online.pamojanova.pamoja',
  appName: 'Pamoja',
  webDir: 'dist',
  server: {
    url: 'https://pamojanova.com',
    androidScheme: 'https',
    // Allow webview to use its HTTP cache between launches — huge win on low networks.
    cleartext: false,
  },
  plugins: {
    Camera: {
      androidScaleType: 'CENTER_CROP',
      saveToGallery: false,
    },
    Geolocation: {},
    Filesystem: {
      iosBackgroundColor: '#FFFFFF',
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    SplashScreen: {
      // Hide the native splash quickly so our in-app splash takes over.
      launchShowDuration: 300,
      launchAutoHide: true,
      backgroundColor: '#0d1a14',
      androidScaleType: 'CENTER_CROP',
      splashFullScreen: true,
      splashImmersive: true,
    },
  },
  android: {
    allowMixedContent: false,
    // Larger webview cache → faster repeat cold-starts on poor network.
    webContentsDebuggingEnabled: false,
  },

};

export default config;
