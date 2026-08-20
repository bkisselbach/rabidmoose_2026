import { useEffect } from 'react';

const SITE_NAME = 'RabidMoose';
export const SITE_URL = (import.meta.env.VITE_SITE_URL ?? 'https://www.rabidmoose.com').replace(/\/$/, '');
/** The 1200x630 social card (`brand/generate-icons.mjs`). Used for every page that doesn't supply
 *  its own image -- a PDP passes the card's art, and should. Before this, an image-less page
 *  actively REMOVED og:image and downgraded twitter:card to `summary`, so navigating to /search
 *  left the document with no preview image at all; index.html's static default only ever survived
 *  on a cold load of `/`. Non-JS unfurlers still see only that static default (see the note on
 *  useSeo below), so this matters for the crawlers that do execute JS, and costs nothing. */
export const DEFAULT_OG_IMAGE = `${SITE_URL}/rabidmoose-og.png`;
export const DEFAULT_DESCRIPTION =
  'RabidMoose — Pokémon card marketplace and Pokédex. Live-priced cards and collector knowledge in one federated search. A Coveo proof of concept.';

function setMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setCanonical(href: string) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

interface SeoOptions {
  /** Page-specific title segment; the site name is appended unless already present. */
  title: string;
  description: string;
  /** Path (with query string if relevant) relative to SITE_URL, e.g. "/search?q=pikachu". */
  path: string;
  /** Absolute image URL for social previews. Falls back to DEFAULT_OG_IMAGE when not provided. */
  image?: string;
  type?: 'website' | 'product' | 'profile' | 'article';
  noindex?: boolean;
}

// Manages document.title + meta/canonical tags client-side. Client-rendered tags are read by
// Google (which executes JS before indexing) but NOT by non-JS social-preview crawlers
// (Facebook/Twitter/Slack unfurlers, etc) -- those will only ever see index.html's static
// defaults. Full fix would require SSR/prerendering, out of scope for this SPA.
export function useSeo({ title, description, path, image, type = 'website', noindex = false }: SeoOptions) {
  useEffect(() => {
    const fullTitle = title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`;
    const url = `${SITE_URL}${path}`;

    document.title = fullTitle;
    setMeta('name', 'description', description);
    setMeta('name', 'robots', noindex ? 'noindex, follow' : 'index, follow');
    setCanonical(url);

    setMeta('property', 'og:title', fullTitle);
    setMeta('property', 'og:description', description);
    setMeta('property', 'og:type', type);
    setMeta('property', 'og:url', url);
    setMeta('property', 'og:site_name', SITE_NAME);

    // Always a large card now: the fallback is a real 1200x630 image, not the absence of one, so
    // there is no longer a case where `summary` (the small square layout) is the honest choice.
    const ogImage = image ?? DEFAULT_OG_IMAGE;
    setMeta('name', 'twitter:card', 'summary_large_image');
    setMeta('name', 'twitter:title', fullTitle);
    setMeta('name', 'twitter:description', description);
    setMeta('property', 'og:image', ogImage);
    setMeta('name', 'twitter:image', ogImage);
  }, [title, description, path, image, type, noindex]);
}

// Injects a <script type="application/ld+json"> block keyed by `id`, so multiple structured-data
// blocks (e.g. Product + BreadcrumbList) can coexist on one page without clobbering each other.
export function useJsonLd(id: string, data: object | null) {
  const serialized = data ? JSON.stringify(data) : null;
  useEffect(() => {
    if (!serialized) return;
    const el = document.createElement('script');
    el.type = 'application/ld+json';
    el.id = `ld-json-${id}`;
    el.textContent = serialized;
    document.head.appendChild(el);
    return () => {
      el.remove();
    };
  }, [id, serialized]);
}
