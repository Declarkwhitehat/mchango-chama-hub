import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a date as dd/mm/yy
 */
export function formatDate(date: string | Date): string {
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = String(d.getFullYear()).slice(-2);
  return `${day}/${month}/${year}`;
}

/**
 * Format a date with time as dd/mm/yy HH:MM
 */
export function formatDateTime(date: string | Date): string {
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  const dateStr = formatDate(d);
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${dateStr} ${hours}:${minutes}`;
}

/**
 * Detects if the app is running as an installed PWA
 * Returns true when running in standalone PWA mode or inside a Capacitor native app
 */
export function isPWAMode(): boolean {
  // Check if running inside a Capacitor native app (APK wrapper)
  const isCapacitor = !!(window as any).Capacitor;

  // Check if running in standalone mode (installed PWA)
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
  
  // Check for iOS Safari standalone mode
  const isIOSStandalone = (window.navigator as any).standalone === true;
  
  return isCapacitor || isStandalone || isIOSStandalone;
}
