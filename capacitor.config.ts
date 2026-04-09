import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'online.pamojanova.pamoja',
  appName: 'Pamoja',
  webDir: 'dist',
  server: {
    url: 'https://pamojanova.online',
    cleartext: true
  }
};

export default config;
