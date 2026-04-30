import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * Lightweight per-page SEO injector.
 *
 * Updates <title>, meta description, canonical link, and Open Graph tags
 * (og:title, og:description, og:url, og:image) on the fly for each route.
 *
 * Canonical URL always points to the primary domain: https://www.pamojanova.com
 *
 * Use it inside any page component:
 *   <SEO title="About | Pamojanova" description="..." />
 */

const PRIMARY_ORIGIN = "https://www.pamojanova.com";
const DEFAULT_OG_IMAGE = `${PRIMARY_ORIGIN}/app-icon-512.png`;

interface SEOProps {
  title: string;
  description: string;
  image?: string;
  /** Override path used in canonical/og:url. Defaults to current pathname. */
  path?: string;
  /** Set to true to add <meta name="robots" content="noindex" /> for private pages. */
  noindex?: boolean;
}

const upsertMeta = (
  selector: string,
  attrName: "name" | "property",
  attrValue: string,
  content: string
) => {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attrName, attrValue);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
};

const upsertCanonical = (href: string) => {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
};

export const SEO = ({ title, description, image, path, noindex }: SEOProps) => {
  const location = useLocation();
  const targetPath = path ?? location.pathname;
  const url = `${PRIMARY_ORIGIN}${targetPath || "/"}`;
  const ogImage = image ?? DEFAULT_OG_IMAGE;

  useEffect(() => {
    if (title) document.title = title.length > 60 ? title.slice(0, 60) : title;

    if (description) {
      const truncated = description.length > 160 ? description.slice(0, 160) : description;
      upsertMeta('meta[name="description"]', "name", "description", truncated);
      upsertMeta('meta[property="og:description"]', "property", "og:description", truncated);
      upsertMeta('meta[name="twitter:description"]', "name", "twitter:description", truncated);
    }

    if (title) {
      upsertMeta('meta[property="og:title"]', "property", "og:title", title);
      upsertMeta('meta[name="twitter:title"]', "name", "twitter:title", title);
    }

    upsertMeta('meta[property="og:url"]', "property", "og:url", url);
    upsertMeta('meta[property="og:image"]', "property", "og:image", ogImage);
    upsertMeta('meta[name="twitter:image"]', "name", "twitter:image", ogImage);
    upsertMeta('meta[property="og:type"]', "property", "og:type", "website");

    upsertCanonical(url);

    // Robots: explicitly remove noindex on public pages, add it on private ones.
    let robots = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (noindex) {
      if (!robots) {
        robots = document.createElement("meta");
        robots.setAttribute("name", "robots");
        document.head.appendChild(robots);
      }
      robots.setAttribute("content", "noindex, nofollow");
    } else if (robots) {
      robots.setAttribute("content", "index, follow");
    }
  }, [title, description, url, ogImage, noindex]);

  return null;
};

export default SEO;
