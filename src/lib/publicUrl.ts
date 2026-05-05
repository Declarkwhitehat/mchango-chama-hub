/**
 * Canonical public URL builder.
 *
 * Always returns links pointing to the live production domain, regardless
 * of whether the app is running on:
 *  - the published preview domain
 *  - the Lovable sandbox preview
 *  - inside the native Capacitor shell (where origin = http://localhost)
 *
 * This guarantees that anything a user shares opens to a real, indexable
 * destination on the public website (and triggers the Android deep-link
 * intent filter in `AndroidManifest.xml`).
 */

export const PUBLIC_BASE_URL = 'https://www.pamojanova.com';

const KNOWN_PUBLIC_HOSTS = new Set([
  'pamojanova.com',
  'www.pamojanova.com',
  'pamojanova.online',
  'www.pamojanova.online',
]);

/**
 * Build a public-facing URL by joining the canonical domain with a path.
 * Pass paths like `/mchango/slug` or `mchango/slug`.
 */
export const buildPublicUrl = (path: string): string => {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${PUBLIC_BASE_URL}${normalized}`;
};

/**
 * Convert any current-origin URL into a canonical public URL.
 * Useful when migrating legacy code that uses `window.location.origin`.
 */
export const toPublicUrl = (urlOrPath: string): string => {
  try {
    const url = new URL(urlOrPath, PUBLIC_BASE_URL);
    if (KNOWN_PUBLIC_HOSTS.has(url.host)) return url.toString();
    return `${PUBLIC_BASE_URL}${url.pathname}${url.search}${url.hash}`;
  } catch {
    return buildPublicUrl(urlOrPath);
  }
};

/**
 * Convenience builders for the most common shareable entities.
 */
const cleanSlug = (slug: string) =>
  (slug || '').toString().trim().toLowerCase().replace(/^-+|-+$/g, '');

export const publicUrls = {
  mchango: (slug: string) => buildPublicUrl(`/mchango/${cleanSlug(slug)}`),
  organization: (slug: string) => buildPublicUrl(`/organizations/${cleanSlug(slug)}`),
  chamaJoin: (slug: string, code?: string) =>
    buildPublicUrl(`/chama/join/${cleanSlug(slug)}${code ? `?code=${encodeURIComponent(code)}` : ''}`),
  welfareJoin: (slug: string) => buildPublicUrl(`/welfare/join/${cleanSlug(slug)}`),
  exploreMchango: () => buildPublicUrl('/explore/mchango'),
  organizationsList: () => buildPublicUrl('/organizations'),
  mchangoList: () => buildPublicUrl('/mchango'),
};
