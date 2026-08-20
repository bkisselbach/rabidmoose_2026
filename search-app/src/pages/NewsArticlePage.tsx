import { PageShell } from '@/components/PageShell';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ExternalLink } from 'lucide-react';
import { PageTitle } from '@/components/PageTitle';
import { CoveoChip } from '@/components/CoveoChip';
import { Button } from '@/components/ui/button';
import { ErrorPanel } from '@/components/ErrorPanel';
import { LOOKUP_FAILED_QUIPS, STORY_NOT_FOUND_QUIPS, pickQuip } from '@/lib/errorQuips';
import { ShopCardsPanel } from '@/components/ShopCardsPanel';
import { CardGridSkeleton } from '@/components/Skeleton';
import { NewsArt, categoryStyle } from '@/components/news/NewsArt';
import { subscribeToCharacter } from '@/lib/characterQueue';
import { fetchNewsArticle, type NewsArticle } from '@/lib/newsArticle';
import { formatNewsDate } from '@/lib/newsRecord';
import { pokemonPath } from '@/lib/paths';
import { useSeo, useJsonLd, SITE_URL } from '@/lib/seo';
import { cn } from '@/lib/utils';

// One news article, and the cross-links that make it worth having in this app rather than a link
// out to pokemon.com: the cards the story is about (live catalog, live prices), the Pokédex entries
// for the species it names, and its topic facets back into the newsroom.

/** A species link that only renders once the species actually resolves against the Pokédex index.
 *  VaultSpotlight's `if (!species) return null` rule: an article naming a regional form, an
 *  alternate spelling or a typo would otherwise produce a dead /pokedex/:name, and a 404 from a
 *  link we generated ourselves is worse than no link. */
function SpeciesLink({ name }: { name: string }) {
  const [resolved, setResolved] = useState<{ characterName: string; image?: string } | null>(null);
  useEffect(() => subscribeToCharacter(name, (rec) => setResolved(rec ?? null)), [name]);

  if (!resolved) return null;
  return (
    <Link
      to={pokemonPath(resolved.characterName)}
      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card py-1 pl-1 pr-3 text-xs font-semibold text-foreground transition-colors hover:border-primary/50 hover:text-primary"
    >
      {resolved.image ? (
        <img src={resolved.image} alt="" className="h-5 w-5 shrink-0 rounded-full bg-white object-contain" />
      ) : (
        <span className="h-5 w-5 shrink-0 rounded-full bg-muted" />
      )}
      {resolved.characterName}
    </Link>
  );
}

/** Stands in for the WHOLE article page, not just its masthead.
 *
 *  It used to stop after the hero and five body lines, which made the skeleton page ~1300px tall --
 *  short enough that the footer sat at y=825, plainly visible in a 1000px viewport, and then shot
 *  off-screen the moment the real article (4000px+) rendered. Measured at 0.15 layout shift, the
 *  page's entire CLS budget spent on a footer nobody wanted to see there. Everything below is a
 *  real section of the settled page: meta row, title, dek, hero, body, source link, the cross-link
 *  card, and the "Cards in this story" shelf. */
function ArticleSkeleton() {
  return (
    <>
      <div className="mx-auto max-w-3xl">
        <div className="skeleton h-4 w-32 rounded-full" />
        {/* Category pill, date, Coveo chip. */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="skeleton h-6 w-24 rounded-full" />
          <div className="skeleton h-3 w-28 rounded-full" />
        </div>
        <div className="skeleton mt-3 h-9 w-full rounded-lg" />
        <div className="skeleton mt-2 h-9 w-2/3 rounded-lg" />
        {/* Dek: text-lg, so two taller lines than the body below. */}
        <div className="mt-3 space-y-2">
          <div className="skeleton h-5 w-full rounded-full" />
          <div className="skeleton h-5 w-4/5 rounded-full" />
        </div>
        <div className="skeleton mt-6 aspect-[16/7] w-full rounded-2xl" />
        {/* Body: four paragraphs of four lines, the shape these stories actually run to -- five
            loose lines was a fifth of a real article. */}
        <div className="mt-6 space-y-4">
          {[0, 1, 2, 3].map((p) => (
            <div key={p} className="space-y-2">
              <div className="skeleton h-4 w-full rounded-full" />
              <div className="skeleton h-4 w-full rounded-full" />
              <div className="skeleton h-4 w-full rounded-full" />
              <div className="skeleton h-4 w-3/4 rounded-full" />
            </div>
          ))}
        </div>
        <div className="skeleton mt-6 h-4 w-56 rounded-full" />
        {/* The species/set/topics cross-link card. */}
        <div className="mt-8 space-y-4 rounded-2xl border border-border bg-card p-5">
          {[
            [72, 88, 64],
            [110],
            [56, 72, 60, 80],
          ].map((widths, i) => (
            <div key={i}>
              <div className="skeleton mb-2 h-3 w-32 rounded-full" />
              <div className="flex flex-wrap gap-2">
                {widths.map((w, j) => (
                  <div key={j} className="skeleton h-6 rounded-full" style={{ width: `${w}px` }} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* "Cards in this story" -- same heading rule and same grid string ShopCardsPanel renders. */}
      <div className="mt-12">
        <div className="mb-5 flex items-center gap-x-2.5 border-b border-border pb-3">
          <div className="skeleton h-8 w-8 shrink-0 rounded-md" />
          <div className="skeleton h-6 w-48 rounded" />
        </div>
        <CardGridSkeleton count={12} className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6" />
      </div>
    </>
  );
}

export function NewsArticlePage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const [article, setArticle] = useState<NewsArticle | null | undefined>(undefined);
  // The `.catch` used to `setArticle(null)`, which told the reader "that story isn't in the
  // newsroom" when what actually happened was the search call never came back -- a lie about whose
  // fault it was, and one that hid the retry that would have fixed it. Tracked separately now:
  // `article === null` is a slug with nothing behind it, `failed` is the request itself.
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // Fixed at mount, not re-picked per render -- see `pickQuip`.
  const [missingQuip] = useState(() => pickQuip(STORY_NOT_FOUND_QUIPS));
  const [failedQuip] = useState(() => pickQuip(LOOKUP_FAILED_QUIPS));

  useEffect(() => {
    let alive = true;
    setArticle(undefined);
    setFailed(false);
    fetchNewsArticle(slug)
      .then((a) => alive && setArticle(a))
      .catch(() => {
        if (!alive) return;
        setFailed(true);
        setArticle(null);
      });
    return () => {
      alive = false;
    };
  }, [slug, attempt]);

  const record = article?.record;

  useSeo({
    title: record?.title ?? 'Pokémon News',
    description: record?.excerpt ?? 'A story from the RabidMoose newsroom.',
    path: `/pokemon-news/${slug}`,
    type: 'article',
    // A slug that resolved to nothing must not be indexable -- it is a real URL serving a
    // not-found state, and letting a crawler keep it would advertise dead pages.
    noindex: article === null,
  });

  useJsonLd(
    'news-article',
    record
      ? {
          '@context': 'https://schema.org',
          '@type': 'NewsArticle',
          headline: record.title,
          description: record.excerpt,
          datePublished: record.date ? new Date(record.date).toISOString() : undefined,
          url: `${SITE_URL}/pokemon-news/${slug}`,
          articleSection: record.category,
          isBasedOn: record.sourceUrl || undefined,
        }
      : null
  );

  if (article === undefined) {
    return (
        <PageShell>
          <ArticleSkeleton />
        </PageShell>
    );
  }

  if (article === null) {
    return (
        <PageShell padded={false}>
          {failed ? (
            <ErrorPanel
              headline="Couldn't load this story"
              quip={failedQuip}
              detail="The newsroom index didn't answer. This is usually temporary."
              actions={
                <>
                  <Button onClick={() => setAttempt((n) => n + 1)}>Try again</Button>
                  <Link
                    to="/pokemon-news"
                    className="text-sm font-semibold text-muted-foreground hover:text-foreground hover:underline"
                  >
                    Back to Pok&eacute;mon News
                  </Link>
                </>
              }
            />
          ) : (
            <ErrorPanel
              headline="Story not found"
              quip={missingQuip}
              detail={
                <>
                  Nothing in the newsroom is filed under <span className="break-all font-mono">{slug}</span>. The link
                  may be old, or the slug mistyped.
                </>
              }
              actions={
                <>
                  <Link to="/pokemon-news" className="text-sm font-semibold text-primary hover:underline">
                    Back to Pok&eacute;mon News
                  </Link>
                  <Link
                    to="/search"
                    className="text-sm font-semibold text-muted-foreground hover:text-foreground hover:underline"
                  >
                    Browse the marketplace &rarr;
                  </Link>
                </>
              }
            />
          )}
        </PageShell>
    );
  }

  const { icon: CategoryIcon, tint, fg } = categoryStyle(record!.category);
  const date = formatNewsDate(record!.date);

  return (
      <PageShell>
        <div className="mx-auto max-w-3xl">
          <Link
            to="/pokemon-news"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-primary"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Pok&eacute;mon News
          </Link>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Link
              to={`/pokemon-news?f-newscategory=${encodeURIComponent(record!.category)}`}
              className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-2xs font-bold uppercase tracking-wide transition-opacity hover:opacity-80', tint, fg)}
            >
              <CategoryIcon className="h-3 w-3 shrink-0" aria-hidden />
              {record!.category}
            </Link>
            {date && <span className="text-xs text-muted-foreground">{date}</span>}
            <CoveoChip capability="news-index" />
          </div>

          <PageTitle className="mt-3">{record!.title}</PageTitle>
          {record!.excerpt && <p className="mt-3 text-lg leading-relaxed text-muted-foreground">{record!.excerpt}</p>}

          <NewsArt record={record!} className="mt-6 aspect-[16/7] w-full rounded-2xl border border-border" />

          {/* The body comes from Coveo Quickview, not the search response -- a search result only
              carries a short relevance-derived excerpt. If Quickview failed, the dek and every
              cross-link below still render: a thin article, not a broken one. */}
          {article.body.length > 0 ? (
            <div className="mt-6 space-y-4">
              {/* The first Quickview paragraph is the dek, already shown above as the standfirst. */}
              {article.body.slice(record!.excerpt && article.body[0] === record!.excerpt ? 1 : 0).map((para, i) => (
                <p key={i} className="text-base leading-relaxed text-foreground">
                  {para}
                </p>
              ))}
            </div>
          ) : (
            <p className="mt-6 text-sm italic text-muted-foreground">
              The full story is on pokemon.com &mdash; the link is below.
            </p>
          )}

          {record!.sourceUrl && (
            <a
              href={record!.sourceUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
            >
              Read the original on pokemon.com
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
          )}

          {(record!.species.length > 0 || record!.setName || record!.tags.length > 0) && (
            <div className="mt-8 space-y-4 rounded-2xl border border-border bg-card p-5">
              {/* This panel is three separate index reads wearing one border, and carried no
                  marker at all: each species chip is resolved against the Pokédex index before it
                  will link anywhere (SpeciesLink), and each topic chip is a real newsroom facet URL
                  that round-trips. One mark for the panel, at its top-right. */}
              {/* empty:hidden -- with the lens off CoveoChip renders nothing, and without this the
                  space-y-4 rhythm would still pay for a row that isn't there. */}
              <div className="flex justify-end empty:hidden">
                <CoveoChip
                  capability={[
                    { capability: 'pokedex-index', detailSuffix: 'Every species chip below is looked up in the Pokédex index — one that isn’t there doesn’t become a link.' },
                    { capability: 'url-manager', detailSuffix: 'Each topic chip is a real newsroom facet URL, so the filtered view it opens is shareable.' },
                  ]}
                />
              </div>
              {record!.species.length > 0 && (
                <div>
                  <p className="eyebrow mb-2">Pok&eacute;mon in this story</p>
                  <div className="flex flex-wrap gap-2">
                    {record!.species.map((name) => (
                      <SpeciesLink key={name} name={name} />
                    ))}
                  </div>
                </div>
              )}
              {record!.setName && (
                <div>
                  <p className="eyebrow mb-2">Set</p>
                  {/* Free text, deliberately NOT a facet preset: set nav is router state only today
                      (`f-cardsetname` is not a real URL param) and rides the recorded presetFacet
                      race. A query survives a reload and a share; the preset does not. */}
                  <Link
                    to={`/search?q=${encodeURIComponent(record!.setName)}`}
                    className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
                  >
                    Shop {record!.setName} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                </div>
              )}
              {record!.tags.length > 0 && (
                <div>
                  <p className="eyebrow mb-2">Topics</p>
                  <div className="flex flex-wrap gap-1.5">
                    {record!.tags.map((tag) => (
                      // A real facet URL, and it round-trips -- the one cross-link that got better
                      // by putting the corpus in Coveo rather than mocking it.
                      <Link
                        key={tag}
                        to={`/pokemon-news?f-newstags=${encodeURIComponent(tag)}`}
                        className="rounded-full border border-border px-2.5 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
                      >
                        {tag}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Live commerce, seeded by the article's own curated query. ShopCardsPanel returns null on
            zero products, so a story with no card angle -- or a query that matches nothing today --
            renders nothing at all rather than an empty shelf. */}
        {record!.cardQuery && (
          <div className="mt-12">
            <ShopCardsPanel query={record!.cardQuery} heading="Cards in this story" />
          </div>
        )}
      </PageShell>
  );
}
