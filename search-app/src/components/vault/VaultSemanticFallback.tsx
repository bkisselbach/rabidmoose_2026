import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, ArrowRight } from 'lucide-react';
import { CoveoChip } from '@/components/CoveoChip';
import { retrievePassages } from '@/passageRetrieval';
import { citationLabel } from '@/lib/citationLabel';
import { pokemonPath } from '@/lib/paths';

// Curated push source only: one document per species, so the top passage names exactly one
// Pokemon. The crawled source risks a passage from the wrong species' page outranking it.
const CURATED_SOURCE_FILTER = '@source=="pokedex-push"';

/** Fires when the Vault search box's keyword query returns zero results, via Coveo Passage
 *  Retrieval over `pokedex-push`.
 *
 *  Chip as `passage-retrieval`, NOT `semantic-encoder` -- associating that encoder to this
 *  pipeline caused a documented regression (charizard 5→441 matches), since reverted. */
export function VaultSemanticFallback({ query }: { query: string }) {
  const [loading, setLoading] = useState(true);
  // undefined = still loading; null = asked and nothing cleared the bar.
  const [result, setResult] = useState<{ name: string; snippet: string } | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setResult(undefined);
    retrievePassages(query, 3, 320, { filter: CURATED_SOURCE_FILTER })
      .catch(() => [])
      .then((passages) => {
        if (cancelled) return;
        setLoading(false);
        const top = passages[0];
        setResult(top ? { name: citationLabel(top.title), snippet: top.text } : null);
      });
    return () => {
      cancelled = true;
    };
  }, [query]);

  if (!loading && result === null) return null;

  return (
    <div className="rise-in mb-8 rounded-2xl border border-coveo/25 bg-coveo/5 p-6 sm:p-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="eyebrow flex items-center gap-1.5 text-coveo">
          <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          No keyword match &mdash; found by meaning instead
        </span>
        <CoveoChip
          capability={{
            capability: 'passage-retrieval',
            detailSuffix:
              'Matches on meaning, not shared keywords -- this query returned zero keyword results, so this comes from a search over passage meaning, not word overlap.',
          }}
        />
      </div>

      {loading && <p className="text-sm text-muted-foreground">Reading the index for a match&hellip;</p>}

      {result && !loading && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs leading-relaxed text-muted-foreground">&ldquo;{result.snippet}&rdquo;</p>
          <Link
            to={pokemonPath(result.name)}
            className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
          >
            {result.name} <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
      )}
    </div>
  );
}
