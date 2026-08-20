import type { Result } from '@coveo/headless';
import { NEWS_FIELDS, NEWS_FIELD_LIST, NEWS_SOURCE } from '@/lib/newsFields';
import { newsRecordFromResult, type NewsRecord } from '@/lib/newsRecord';
import { getVisitorId } from '@/lib/visitorId';

// The article page's own data access: resolve one article by slug, then fetch its body.
//
// DELIBERATELY OFF `newsEngine`. A detail-page lookup must not overwrite the index page's result
// slice -- the engine-isolation rule vaultEngine.ts records, applied within a single engine rather
// than between two. Running this as a plain fetch also means going Back from an article to the
// listing restores the listing's own results untouched, with no re-search.
//
// Same raw-Search-API shape pokedexRoster.ts / typeMatchups.ts / typeCounts.ts already use.

const ORG = import.meta.env.VITE_COVEO_ORG_ID;
const TOKEN = import.meta.env.VITE_COVEO_SEARCH_TOKEN;
const SEARCH_URL = `https://platform.cloud.coveo.com/rest/search/v2?organizationId=${ORG}`;
const HTML_URL = `https://platform.cloud.coveo.com/rest/search/v2/html?organizationId=${ORG}`;

export interface NewsArticle {
  record: NewsRecord;
  /** Body paragraphs, from Quickview. Empty if the body could not be fetched -- the page still
   *  renders the dek and every cross-link rather than failing whole. */
  body: string[];
  /** Needed for the Quickview request; not otherwise interesting to the page. */
  uniqueId: string;
}

/** Escapes a slug for safe interpolation into a Coveo query expression. Slugs are `[a-z0-9-]` by
 *  construction, but a URL param is attacker-controlled and `"` would break out of the literal. */
function escapeForExpression(value: string): string {
  return value.replace(/["\\]/g, '');
}

async function post(url: string, body: BodyInit, contentType: string) {
  return fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': contentType },
    body,
  });
}

/**
 * Turns Coveo's Quickview HTML into paragraphs.
 *
 * Quickview wraps the indexed document in a full HTML shell that carries a large injected
 * stylesheet and a placeholder `<title>Unknown document title</title>` -- measured, ~3.1KB of which
 * only ~900 bytes is the article. So this takes the `<body>`, drops `<style>`/`<script>` outright
 * (a naive tag-strip leaks the whole CSS block into the page as text, which is exactly what a first
 * pass did), then splits on block boundaries.
 */
function paragraphsFromQuickview(html: string): string[] {
  const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? html;
  const cleaned = body
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '');

  const decode = (s: string) => {
    const el = document.createElement('textarea');
    el.innerHTML = s;
    return el.value;
  };

  return cleaned
    .split(/<\/(?:p|div|br|h\d)>|<br\s*\/?>/i)
    .map((chunk) => decode(chunk.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0);
}

/** Resolves `/pokemon-news/:slug` to its article. `null` means no such article -- the page renders
 *  its not-found state rather than redirecting, so the typed URL stays in the bar. */
export async function fetchNewsArticle(slug: string): Promise<NewsArticle | null> {
  const res = await post(
    SEARCH_URL,
    JSON.stringify({
      q: '',
      aq: `@source=="${NEWS_SOURCE}" @${NEWS_FIELDS.slug}=="${escapeForExpression(slug)}"`,
      // 1, not 0: a zero-result count query reports totalCount 0 on this source (measured
      // 2026-08-17 -- the count path lags the retrieval path on a recently indexed source), so
      // asking for zero rows here would make every article look missing.
      numberOfResults: 1,
      searchHub: 'Pokemon News',
      // Same visitor id the engines report (added 2026-08-18). Without it this lookup -- which
      // happens on every article open -- was an unattributable request in the logs, so a visitor's
      // reading history could not be joined to the searches that led to it.
      // See presentation/analytics-events-plan.md §2 G4.
      //
      // `capture: false` deliberately, and this is the opposite call to the one passageRetrieval.ts
      // makes: resolving an article the visitor has ALREADY chosen is a detail-page lookup, not a
      // search. Capturing it would invent a second, phantom "search" for every article opened --
      // one whose query is empty and whose single result is a foregone conclusion -- and that is
      // exactly the kind of dirt that skews the models. The click on the news card is the real
      // event, and NewsCard now logs it (see lib/useInteractiveResult.ts).
      analytics: {
        clientId: getVisitorId(),
        capture: false,
      },
      fieldsToInclude: NEWS_FIELD_LIST,
    }),
    'application/json'
  );
  if (!res.ok) return null;

  const data = await res.json();
  const result: Result | undefined = data.results?.[0];
  if (!result) return null;

  const article: NewsArticle = {
    record: newsRecordFromResult(result),
    body: [],
    uniqueId: result.uniqueId,
  };

  // Body is a second request and a soft dependency: if Quickview fails, the page still has the
  // dek, the metadata and every cross-link, which is a thin article rather than a broken one.
  try {
    const html = await post(
      HTML_URL,
      new URLSearchParams({ uniqueId: result.uniqueId }),
      'application/x-www-form-urlencoded'
    );
    if (html.ok) article.body = paragraphsFromQuickview(await html.text());
  } catch {
    // keep the article, lose the body
  }

  return article;
}
