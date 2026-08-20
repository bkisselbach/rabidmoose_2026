import { PageShell } from '@/components/PageShell';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CONTENT_FIELDS } from '@/contentFields';
import { ShopCardsPanel } from '@/components/ShopCardsPanel';
import { PokemonDetailSkeleton } from '@/components/Skeleton';
import { AskPokedex } from '@/components/AskPokedex';
import { PokemonSummaryCard } from '@/components/pokedex/PokemonSummaryCard';
import { CoveoChip } from '@/components/CoveoChip';
import { toPokemonRecord, type PokemonRecord } from '@/lib/pokedexRecord';
import { useSeo } from '@/lib/seo';
import { Button } from '@/components/ui/button';
import { ErrorPanel } from '@/components/ErrorPanel';
import { LOOKUP_FAILED_QUIPS, SPECIES_NOT_FOUND_QUIPS, pickQuip } from '@/lib/errorQuips';
import { pokemonPath, slugify } from '@/lib/paths';

const shell = (content: React.ReactNode) => (
  // flex-1 main (the persistent App-level shell supplies flex-col/min-h-screen and the header
  // now, see App.tsx): without it the footer lands wherever the content happens to end, which on
  // the short states below (loading, "no Pokemon found") is the middle of the viewport.
    <PageShell className="space-y-12">{content}</PageShell>
);

// The Pokemon PDP, structured as two clearly-bounded zones: everything about the *species*
// first (identity panel, knowledge row, ask-the-Pokedex), then everything that's *for sale*
// (the card gallery). Fetches its one document directly from the Coveo Search API, independent
// of the federated search page's Headless state -- so this page works as a standalone deep link.
export function CharacterDetailPage() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const [record, setRecord] = useState<PokemonRecord | null>(null);
  // Two failures, not one. `missing` means the slug resolved to nothing in the index -- a dead
  // URL, the visitor's typo, permanent. `failed` means the Coveo call itself didn't come back --
  // our problem, and very likely gone on the next try. They used to collapse into one string
  // rendered as one line of grey text, so an outage and a typo looked identical and neither
  // offered the action that would have fixed it (retry / go somewhere else).
  const [error, setError] = useState<'missing' | 'failed' | null>(null);
  // Bumped by the retry button; it is in the fetch effect's deps, so incrementing it refetches.
  const [attempt, setAttempt] = useState(0);
  // Fixed at mount, never re-picked per render (see `pickQuip`): a retry that reshuffles the joke
  // reads as a second, different failure.
  const [missingQuip] = useState(() => pickQuip(SPECIES_NOT_FOUND_QUIPS));
  const [failedQuip] = useState(() => pickQuip(LOOKUP_FAILED_QUIPS));

  useEffect(() => {
    if (!name) return;
    // Clear before fetching, and ignore a response for a name we've already navigated away from:
    // this page stays mounted across species-to-species moves (the evolution line links), so
    // without both guards the previous Pokemon's panels -- or a stale error screen -- would keep
    // rendering under the new URL until the new response lands. Same pattern as useCharacterLookup.
    setRecord(null);
    setError(null);
    const organizationId = import.meta.env.VITE_COVEO_ORG_ID;
    const accessToken = import.meta.env.VITE_COVEO_SEARCH_TOKEN;
    let cancelled = false;

    const search = (body: Record<string, unknown>) =>
      fetch(`https://platform.cloud.coveo.com/rest/search/v2?organizationId=${organizationId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: '', numberOfResults: 1, ...body }),
      }).then((res) => res.json());

    // Exact field match resolves most slugs directly ("pikachu", and "ho-oh" since field
    // equality is case-insensitive). Names whose slug drops punctuation ("mr-mime" for
    // "Mr. Mime", "farfetch-d" for "Farfetch'd") miss, so fall back to a free-text query on the
    // de-hyphenated slug and pick the result whose name slugifies back to the URL param --
    // never a merely-similar species.
    search({ aq: `@${CONTENT_FIELDS.name}=="${name}"` })
      .then(async (data) => {
        if (data.results?.length) return data.results[0];
        const fallback = await search({ q: name.replace(/-/g, ' '), numberOfResults: 12 });
        return (
          (fallback.results as Array<{ raw: Record<string, unknown> }> | undefined)?.find(
            (r) => slugify(String(r.raw?.[CONTENT_FIELDS.name] ?? '')) === slugify(name)
          ) ?? null
        );
      })
      .then((result) => {
        if (cancelled) return;
        if (!result) {
          setError('missing');
          return;
        }
        const resolved = toPokemonRecord(result.raw, name ?? '');
        // Canonicalize old-style URLs (/pokedex/mr.%20mime) to the slug form (/pokedex/mr-mime)
        // right here, against the `name` this fetch was actually for -- not in a separate effect
        // keyed on `record`. That used to read `record` from the CURRENT render's closure, which
        // on a same-page species-to-species navigation (an evolution-chain link, the species
        // ribbon) is still the PREVIOUS species for one commit: `name` changes to the new slug
        // immediately, but this effect's own `setRecord(null)` above hasn't landed as a re-render
        // yet, so the canonicalize effect fired with the OLD record and the NEW name, decided they
        // mismatched, and navigated straight back to the page the reader just left. Deciding it
        // inside the same async chain that resolved `resolved` removes the stale pairing entirely.
        const canonical = slugify(resolved.characterName);
        if (canonical && name !== canonical) {
          navigate(pokemonPath(resolved.characterName), { replace: true });
          return;
        }
        setRecord(resolved);
      })
      .catch(() => {
        if (!cancelled) setError('failed');
      });

    return () => {
      cancelled = true;
    };
  }, [name, navigate, attempt]);

  const seoName = record?.characterName ?? name ?? 'Pokémon';
  useSeo({
    // A dead slug is not a species name, so don't title the tab as though it were one
    // ("notarealmon — Pokédex Entry" reads like a real entry in a history list).
    title: error === 'missing' ? 'Pokémon not found' : `${seoName} — Pokédex Entry`,
    description: record?.species
      ? `${seoName} Pokédex entry: ${record.species}${record.typeList.length ? ` (${record.typeList.join('/')} type)` : ''}. Plus real, live-priced ${seoName} cards for sale.`
      : `${seoName} Pokédex entry and real, live-priced trading cards for sale.`,
    path: record ? pokemonPath(record.characterName) : `/pokedex/${encodeURIComponent(name ?? '')}`,
    image: record?.image,
    type: 'profile',
    // The URL matched a route, so this page is served 200 either way -- which makes a dead species
    // slug a textbook soft 404: an indexable page whose only content is "there is nothing here".
    // Keep those out of the index the same way the catch-all 404 route does. `failed` is noindexed
    // too, and for a different reason: it is a transient state, and an indexer that happens to
    // crawl during a Coveo blip should not cache the error as the page.
    noindex: error !== null,
  });

  if (error === 'missing')
    return shell(
      <ErrorPanel
        headline="No such Pokémon"
        quip={missingQuip}
        detail={
          <>
            Nothing in the Pok&eacute;dex answers to <span className="break-all font-mono">{name}</span>.
          </>
        }
        actions={
          <>
            <Link to="/pokedex" className="text-sm font-semibold text-primary hover:underline">
              Search the Pok&eacute;dex
            </Link>
            <Link
              to="/search"
              className="text-sm font-semibold text-muted-foreground hover:text-foreground hover:underline"
            >
              Browse all cards &rarr;
            </Link>
          </>
        }
      />
    );

  if (error === 'failed')
    return shell(
      <ErrorPanel
        headline="Couldn't load this Pokémon"
        quip={failedQuip}
        detail="The Pokédex index didn't answer. This is usually temporary."
        actions={
          <>
            <Button onClick={() => setAttempt((n) => n + 1)}>Try again</Button>
            <Link
              to="/pokedex"
              className="text-sm font-semibold text-muted-foreground hover:text-foreground hover:underline"
            >
              Back to the Pok&eacute;dex
            </Link>
          </>
        }
      />
    );
  // A page-shaped skeleton, not a "Loading..." line: this page's layout is the largest in the app
  // (the 3/2 knowledge grid plus a gallery of every card for the species), so one line of grey
  // text becoming all of that in a single frame was the biggest pop anywhere here -- and the odd
  // one out next to /pokemon-news/:slug, which has had a page-shaped skeleton all along.
  // `role="status"` because what's on screen is now purely decorative shapes, which announce
  // nothing on their own.
  if (!record)
    return shell(
      // space-y-12 restated here because the shell's own copy applies BETWEEN its children, and
      // this state is a single child wrapping the skeleton's two sections.
      <div role="status" aria-label={`Loading ${name ?? 'Pokémon'}`} className="space-y-12">
        <PokemonDetailSkeleton />
      </div>
    );

  return shell(
    <>
      <div>
        {/* Two columns: the compact species card on the left, Ask the Pokédex promoted to a
            sticky right rail. Passage Retrieval lives inside AskPokedex (evidence for the asked
            question) rather than as a standalone "From the web" panel -- fed a generic "tell me
            about X" query it mostly echoed pokemondb table boilerplate. */}
        <div className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-5">
          <div className="min-w-0 lg:col-span-3">
            <PokemonSummaryCard pokemon={record} chip={<CoveoChip capability="pokedex-index" />} />
          </div>
          <div className="flex min-w-0 flex-col lg:col-span-2">
            <div className="lg:sticky lg:top-6 lg:h-full">
              <AskPokedex characterName={record.characterName} className="h-full" />
            </div>
          </div>
        </div>
      </div>

      <ShopCardsPanel query={record.characterName} heading={`Shop ${record.characterName} cards`} showEyebrow={false} />
    </>
  );
}
