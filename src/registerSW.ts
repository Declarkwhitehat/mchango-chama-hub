import { registerSW } from 'virtual:pwa-register';

const updateSW = registerSW({
  onNeedRefresh() {
    // New content available - reload immediately for best UX
    if (confirm('New version available. Reload to update?')) {
      updateSW(true);
    }
  },
  onOfflineReady() {
    console.log('App ready to work offline');
  },
  immediate: true // Check for updates immediately on load
});

export { updateSW };
