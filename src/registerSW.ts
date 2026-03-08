import { registerSW } from 'virtual:pwa-register';

const isPreviewOrDev =
  window.location.hostname.includes('lovable.app') ||
  window.location.hostname.includes('localhost') ||
  window.location.hostname.includes('127.0.0.1');

const isMobileUA = /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent);

// Only register SW on real mobile devices visiting the published production URL
const shouldRegisterSW = isMobileUA && !isPreviewOrDev;

function cleanupServiceWorkers() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) {
        registration.unregister();
      }
    });
  }
  if ('caches' in window) {
    caches.keys().then((names) => {
      names.forEach((name) => caches.delete(name));
    });
  }
}

if (shouldRegisterSW) {
  const updateSW = registerSW({
    onNeedRefresh() {
      if (confirm('New version available. Reload to update?')) {
        updateSW(true);
      }
    },
    onOfflineReady() {
      console.log('App ready to work offline');
    },
    immediate: true
  });
} else {
  // Preview, dev, or desktop: always clean up stale SWs and caches
  cleanupServiceWorkers();
}
