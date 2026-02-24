import { registerSW } from 'virtual:pwa-register';

const isMobile = /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent) ||
  window.innerWidth <= 768;

if (isMobile) {
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
  // Desktop: unregister any existing service workers
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) {
        registration.unregister();
      }
    });
  }
}
