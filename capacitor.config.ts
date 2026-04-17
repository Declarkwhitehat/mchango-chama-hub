import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'online.pamojanova.pamoja',
  appName: 'Pamoja',
  webDir: 'dist',
  server: {
    url: 'https://pamojanova.online',
    cleartext: true
  },
  plugins: {
    Camera: {
      // Android: ask only when the user actually invokes the camera
      androidScaleType: 'CENTER_CROP',
      saveToGallery: false,
    },
    Geolocation: {
      // Permission prompts are deferred until first use
    },
    Filesystem: {
      iosBackgroundColor: '#FFFFFF',
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
  android: {
    allowMixedContent: true,
  },
};

export default config;
