import { getVisitorId } from '@/lib/visitorId';

export interface Passage {
  text: string;
  relevanceScore: number;
  title: string;
  clickUri?: string;
  source?: string;
}

interface PassageRetrieveResponse {
  items: {
    text: string;
    relevanceScore: number;
    document: { title: string; primaryid: string; clickableuri?: string; source?: string };
  }[];
  responseId: string;
}

// The retrieval half of Coveo's RAG story: raw, ML-ranked passages straight from the index
// (Coveo Passage Retrieval API) for the user's *actual question*. Consumed by AskPokedex.tsx,
// which shows the top passages as source evidence under RGA's generated answer -- and as the
// fallback answer when RGA can't generate one. (An earlier standalone "From the web" panel fed
// this a generic "Tell me about X" query; against this crawl that mostly returned the page's
// own intro -- duplicating the curated deep dive -- or stat-table boilerplate, so the panel
// read as "not answering" and was folded into the ask flow.)
//
// The webcrawler source it draws from indexes the *entire* pokemondb.net page (nav menus,
// move-list tables, stat legalese, and all), so passages need aggressive cleanup before they're
// presentable, and even then some questions just won't have a decent one -- callers should be
// prepared for an empty result and hide the section rather than force something onto the page.
const NAV_NOISE_LINE = /^(skip to main content|contents)$/i;
// Crawled "- ..." lines are nav menus and forum-question links, never prose we want to quote.
const BULLET_LINE = /^-\s+/;
// The crawled page's own <title> shows up as a text line inside passages -- every pokemondb
// title ends with the site name, so match on that rather than one page's title pattern.
const PAGE_TITLE_LINE = /\|\s*Pokémon Database\s*$/i;
const MIN_PROSE_LENGTH = 150;

// Whole-passage rejects: pokemondb boilerplate that reads as full sentences (so it survives the
// prose check below) but answers nothing -- stat-range legalese and move-list preambles.
const BOILERPLATE_PASSAGE = [
  /ranges shown on the right are for a level 100/i,
  /learns the following/i,
  /compatible with these technical machines/i,
];

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function cleanPassageText(text: string): string {
  const lines = decodeEntities(text)
    .split('\n')
    .filter((line) => !/^\s*[|:-][\s|:-]*$/.test(line) && (line.match(/\|/g) ?? []).length < 2)
    .join('\n')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#+\s*/gm, '')
    .replace(/[*_]{1,2}([^*_]+)[*_]{1,2}/g, '$1')
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      return !NAV_NOISE_LINE.test(trimmed) && !BULLET_LINE.test(trimmed) && !PAGE_TITLE_LINE.test(trimmed);
    });

  // Leftover heading and label lines ("Charizard", "Evolution chart", "Species: Flame Pokémon",
  // the type-name runs on the National Dex list page) read as noise wherever they sit -- not just
  // before the prose starts, where an earlier version stopped stripping. Short lines that don't
  // end a sentence are never prose we want to quote, so drop them everywhere; blank lines stay to
  // preserve paragraph breaks. This also keeps the curated doc and the crawled page opening with
  // the same sentence, which the near-duplicate collapse below relies on.
  const prose = lines.filter((line) => {
    const trimmed = line.trim();
    return trimmed === '' || trimmed.length > 40 || /[.!?]$/.test(trimmed);
  });

  return prose.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// Cutting at a hard character limit left passages ending mid-word ("...and Pokémon Go, one of"),
// which read as broken. Prefer the last sentence end past 40% of the budget; otherwise ellipsize.
function truncateAtSentenceEnd(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastEnd = Math.max(
    cut.lastIndexOf('. '),
    cut.lastIndexOf('.\n'),
    cut.lastIndexOf('! '),
    cut.lastIndexOf('? '),
    cut.endsWith('.') || cut.endsWith('!') || cut.endsWith('?') ? cut.length - 1 : -1
  );
  return lastEnd > max * 0.4 ? cut.slice(0, lastEnd + 1) : `${cut.replace(/\s+\S*$/, '')}…`;
}

// A page's H2/H3 titles ("Training", "Breeding", "Evolution chart", ...) lose their "#" in
// cleanup and survive as short, heading-shaped lines that can pad a passage well past
// MIN_PROSE_LENGTH without it reading as prose -- weight "short line-ness" by the characters
// it actually accounts for, not by raw line count, so a couple of short metadata lines next to
// substantial prose don't sink an otherwise-good passage.
function looksLikeProse(text: string): boolean {
  if (text.length < MIN_PROSE_LENGTH) return false;
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return false;
  const shortLines = lines.filter((l) => l.length <= 30);
  const shortCharShare = shortLines.reduce((n, l) => n + l.length, 0) / text.length;
  if (shortCharShare > 0.3) return false;
  const sentenceCount = (text.match(/[.!?](\s|$)/g) ?? []).length;
  return sentenceCount >= Math.max(2, Math.floor(text.length / 250));
}

// The curated push article and the crawled page restate the same facts in the same order, so two
// passages can be near-identical while sharing no common opening -- one leads with the article's
// "# Charizard — Pokédex article" heading, the other with the page's own first sentence. Comparing
// them as *sentence sets* catches that; comparing the first ~120 characters (an earlier version)
// did not, and once both sources joined the grounding set the panel's two evidence slots were
// regularly spent on one fact told twice.
const NEAR_DUPLICATE_SHARE = 0.5;

function sentenceKeys(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim())
    .filter((s) => s.length > 20);
}

function dropNearDuplicates(passages: Passage[], limit: number): Passage[] {
  const kept: Passage[] = [];
  const seenSentences = new Set<string>();
  for (const passage of passages) {
    if (kept.length >= limit) break;
    const keys = sentenceKeys(passage.text);
    const shared = keys.length === 0 ? 0 : keys.filter((k) => seenSentences.has(k)).length / keys.length;
    if (kept.length > 0 && shared >= NEAR_DUPLICATE_SHARE) continue;
    for (const key of keys) seenSentences.add(key);
    kept.push(passage);
  }
  return kept;
}

interface RetrieveOptions {
  /** Coveo query-syntax expression restricting which documents can contribute a passage, e.g.
   *  `@source=="pokedex-push"`. Unfiltered retrieval reaches the whole index, which on a
   *  species page means a question can be "answered" with a passage about a different Pokemon
   *  ("How does it evolve?" returned Wormadam and Charjabug passages). */
  filter?: string;
}

export async function retrievePassages(
  query: string,
  maxPassages = 2,
  maxChars = 700,
  { filter }: RetrieveOptions = {}
): Promise<Passage[]> {
  const organizationId = import.meta.env.VITE_COVEO_ORG_ID;
  const accessToken = import.meta.env.VITE_COVEO_SEARCH_TOKEN;

  const res = await fetch(`https://${organizationId}.org.coveo.com/rest/search/v3/passages/retrieve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      query,
      // The visitor this retrieval belongs to. This was the one raw fetch in the app that never
      // adopted the visitorId.ts convention (added 2026-08-18), so every Passage Retrieval call --
      // the Vault's "describe it" finder, AskPokedex's evidence fallback -- was orphaned: it could
      // not be joined to the session that made it, and the Passage Retrieval story had no
      // analytics trail behind it at all. Same id the engines report, so a visitor's passage reads
      // and their searches line up. See presentation/analytics-events-plan.md §2 G4.
      //
      // NOTE the nesting: this endpoint takes `analytics: { clientId, capture }`, NOT a top-level
      // `clientId` the way the Commerce v2 search endpoint does. Two different APIs, two different
      // shapes -- getting it wrong is silent, since an unknown top-level key is simply ignored.
      //
      // `capture: true`, unlike the app's other raw fetches. Those opt out because they are
      // decorative re-reads of things the visitor already saw; this one is the opposite -- every
      // call here is a question the visitor actually asked (the Vault's zero-result fallback, an
      // Ask Pokédex evidence lookup), so it is a real search and belongs in the behavioral signal.
      analytics: {
        clientId: getVisitorId(),
        capture: true,
      },
      // Routes to the `pokedex-passages` pipeline (split from the shared `default` one
      // 2026-08-16) -- same tuning today (stop words, thesaurus), but independently tunable
      // and independently visible in query logs without risking RGA's measured 49/50.
      searchHub: 'Pokedex Passages',
      localization: { locale: 'en-US' },
      // Ask for more candidates than we show -- the top-ranked passage is often a page-heading
      // skeleton rather than real prose, so there needs to be a runner-up to fall back to once
      // the noise gets filtered out below.
      maxPassages: Math.max(maxPassages, 6),
      additionalFields: ['clickableuri', 'source'],
      ...(filter ? { filter } : {}),
    }),
  });

  if (!res.ok) return [];
  const data: PassageRetrieveResponse = await res.json();

  const cleaned = (data.items ?? []).map((item) => ({
    text: truncateAtSentenceEnd(cleanPassageText(item.text), maxChars),
    relevanceScore: item.relevanceScore,
    title: item.document.title,
    clickUri: item.document.clickableuri,
    source: item.document.source,
  }));

  // No fallback to a raw/noisy candidate: the caller hides the section entirely when this
  // comes back empty, which reads better than surfacing a page's heading skeleton.
  return dropNearDuplicates(
    cleaned.filter((p) => looksLikeProse(p.text) && !BOILERPLATE_PASSAGE.some((re) => re.test(p.text))),
    maxPassages
  );
}
