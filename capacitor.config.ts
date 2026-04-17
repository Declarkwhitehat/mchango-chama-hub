import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'online.pamojanova.pamoja',
  appName: 'Pamoja',
  webDir: 'dist',
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
  },
  android: {
    allowMixedContent: true,
  },
};

export default config;
