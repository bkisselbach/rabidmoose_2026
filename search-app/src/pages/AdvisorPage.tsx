import { PageShell } from '@/components/PageShell';
import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Compass, ShieldAlert, Layers, ChevronDown } from 'lucide-react';
import { logCustomInteraction } from '@/lib/customEvents';
import { useDeckCheck } from '@/lib/deckCoverage';
import { useDeck } from '@/lib/deckStorage';
import { useBrief } from '@/lib/consultationBrief';
import { formatPriceRange } from '@/lib/priceIntent';
import { CoveoChip } from '@/components/CoveoChip';
import { PageTitle } from '@/components/PageTitle';
import { SuggestedPickups } from '@/components/deck-check/SuggestedPickups';
import { CollectionNarration } from '@/components/deck-check/CollectionNarration';
import { DeckHealthNarration } from '@/components/deck-check/DeckHealthNarration';
import { DeckAdvisor } from '@/components/deck-check/DeckAdvisor';
import { GapPanel } from '@/components/deck-check/GapPanel';
import { useGapSuggestions } from '@/lib/useGapSuggestions';
import { useCollectionCheck } from '@/lib/useCollectionCheck';
import {
  SetCollector,
  VariantChecklistPanel,
  PortfolioStrip,
  SurplusStrip,
  StartFromSet,
} from '@/components/deck-check/CollectionPanels';
import { getActivePersona } from '@/lib/visitorId';
import { typeColor, TYPE_COLORS } from '@/lib/typeColors';
import { useSeo } from '@/lib/seo';

// The full-page version of the cart drawer's Consultant deck review -- phase S1 of
// presentation/consultant-everywhere-plan.md. Same useDeckCheck hook the cart panel reads, but as
// of deck-builder-advisor-plan.md's Phase A it reads a real, persisted, per-persona "My Deck"
// (deckStorage.ts / useMyDeck.ts) instead of the live cart -- a deck a shopper builds is a
// different thing from what they're about to buy, and conflating the two made "suggested pickups"
// (that plan's Phase B) a circular sentence. My Deck is seeded from each persona's own taste
// profile on first read (Persona.seedProductIds), mocked locally by direct user decision rather
// than attempting an unverified Usage-Analytics-backed "previous purchases" read.
//
// "18 types x covered/exposed" from the plan doc is deliberately narrowed to exposure-only here:
// the Pokedex index carries each species' WEAKNESSES, not an offensive-coverage or resistance
// dimension, so a literal "covered" column would be a claim this data can't back up. The grid below
// shows what it actually has -- how many of the deck's species share each weakness -- and says
// nothing about the 15 types that aren't a problem, rather than mislabeling "no data" as "covered".
//
// EXPOSURE IS RANKED FIRST, THE 18-TYPE GRID IS SECONDARY. The insight useDeckCheck computes is an
// ORDER -- weaknesses sorted by how many species share them, which is the whole difference between
// "a real hole" and "a bad matchup" (see that file's own note). Rendering all 18 types as a grid in
// TYPE_COLORS order threw that order away and made the page's strongest signal invisible in its
// layout, while 15 grey tiles carried most of the visual weight. The ranked bars below lead; the
// full grid stays, one disclosure down, because dropping it would lose the "no exposure detected"
// half that keeps the panel honest about what it does and doesn't claim.

const ALL_TYPES = Object.keys(TYPE_COLORS);

// How many ranked bars lead the panel. Five is enough to show the shape of the ranking (a top-heavy
// deck reads differently from a flat one) without turning a diagnosis into a chart -- a six-species
// deck can carry a dozen distinct weaknesses, and the tail of ones hitting a single card is exactly
// what the ranking exists to push down. The rest are one click away in the full grid.
const RANKED_BARS = 5;

// Prerequisite species that get their own row of buyable tiles. Beyond this they stay as the linked
// names in the sentence above: Dana's seeded deck alone misses six stages, and six four-tile rows
// would make the evolution block longer than the rest of the page put together.
const PREREQUISITE_ROWS = 3;

/** The deck read — inline for the player, one disclosure down for the collector.
 *
 *  BOTH ANALYSES STILL ALWAYS RUN. This collapses the deck half's PRESENTATION for Dana and nothing
 *  else: the hook, the species resolution and the exposure computation are identical either way,
 *  which is what keeps S14's honesty claim true (persona picks which lens leads, never which one
 *  exists). A collector genuinely does want to know how their cards would play — they just do not
 *  want it as the second full screen of a page they opened to see what they are missing. */
function DeckLens({ collapsed, children }: { collapsed: boolean; children: React.ReactNode }) {
  if (!collapsed) return <>{children}</>;
  return (
    <details className="group rounded-2xl border border-border bg-card">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 p-4 text-xs font-semibold text-muted-foreground hover:text-foreground">
        <ChevronDown className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-180" aria-hidden />
        Deck Advisor — how this collection would play
      </summary>
      <div className="border-t border-border p-4">{children}</div>
    </details>
  );
}

function TypeExposureTile({ type, count }: { type: string; count: number }) {
  const { bg, text } = typeColor(type);
  const exposed = count > 0;
  return (
    <div
      className={`flex items-center justify-between rounded-md px-2.5 py-1.5 text-xs font-semibold ${exposed ? '' : 'bg-muted/60 text-muted-foreground'}`}
      style={exposed ? { backgroundColor: bg, color: text } : undefined}
    >
      <span>{type}</span>
      {exposed && <span className="tabular-nums">{count}</span>}
    </div>
  );
}

/** One ranked weakness: the type, a bar as long as the share of the deck that folds to it, and the
 *  count in words the bar alone can't give ("4 of 6" is the sentence; the bar is the glance). */
function ExposureBar({ type, count, total }: { type: string; count: number; total: number }) {
  const { bg } = typeColor(type);
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-16 shrink-0 truncate text-xs font-bold" style={{ color: bg }}>
        {type}
      </span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, backgroundColor: bg }} />
      </div>
      <span className="w-14 shrink-0 text-right text-2xs tabular-nums text-muted-foreground">
        {count} of {total}
      </span>
    </div>
  );
}

export function AdvisorPage() {
  useSeo({
    title: 'Advisor',
    description: 'Type exposure, evolution gaps, and budget for your Pokémon TCG deck -- powered by the Card Consultant.',
    path: '/advisor',
  });

  const collection = useCollectionCheck();
  const storedLines = useDeck();
  // THE DECK LIST READS THE SAME BATCHED FETCH THE PANELS DO, rather than useMyDeck's one-request-
  // per-id path. That hook is fine for a six-tile rail; measured on Dana's 69-card collection it
  // put this page at 177 Coveo requests and drew 429s -- rate-limited, on the surface whose whole
  // argument is that it reads one index cheaply. This page only ever needed a name and a price off
  // each product, both of which the roster fetch already carries, so the entire per-id path is
  // simply not used here. (useMyDeck itself is left alone; nothing else imports it.)
  const holdingById = new Map(collection.holdings.map((c) => [c.productId, c]));
  const deckLines = storedLines
    .map((l) => {
      const card = holdingById.get(l.productId);
      return card ? { productId: l.productId, quantity: l.quantity, name: card.name, price: card.price } : null;
    })
    .filter((l): l is { productId: string; quantity: number; name: string; price: number } => l !== null);
  const deckResolving = collection.isLoading;
  // WHICH LENS LEADS -- not which one exists. Both analyses always run over the same holdings
  // (gap-check-plan.md 1): a collector still wants to know how their cards would fare in a game,
  // and a player still has sets. Persona only decides the reading order, which is also the precise
  // form the S14 honesty gate has to take: no persona changes what a query returns.
  const collectorLeads = getActivePersona().key === 'dana';
  const deckCartLines = deckLines.map((l) => ({ name: l.name }));
  const { species, weaknesses, weaknessCounts, topWeaknesses, missingStages, isResolving } = useDeckCheck(deckCartLines);
  const brief = useBrief();

  const deckCardCount = deckLines.reduce((sum, l) => sum + l.quantity, 0);

  // There is no "run the check" button to hang this on -- the page computes from the stored deck as
  // soon as it resolves -- so the check IS the moment both resolutions finish with a non-empty
  // deck. Ref-guarded to once per mount: `deckCardCount` changes every time a quantity stepper is
  // touched, and editing a deck is not re-running the check.
  const deckCheckLogged = useRef(false);
  useEffect(() => {
    if (deckCheckLogged.current || deckResolving || isResolving || deckCardCount === 0) return;
    deckCheckLogged.current = true;
    logCustomInteraction('deckCheckRun', { deckSize: deckCardCount });
  }, [deckResolving, isResolving, deckCardCount]);
  const counterQueryFor = (type: string) =>
    brief?.budget ? `Beat ${type} types under ${formatPriceRange(brief.budget)}` : `Beat ${type} types`;

  // "ANSWERS", NOT "COUNTERS". The QUERY is untouched -- "Beat Electric types under $25" is the
  // exact sentence /search's query understanding already resolves into a @cardtypes filter, and
  // changing it would change the results. Only the label moved, and it moved for a real reason:
  // "counters" reads as a repair, and these cannot repair anything. Exposure counts YOUR species'
  // weaknesses, so adding a card never lowers it and a pick that shares the weakness raises it.
  // The page was inviting an action that provably could not improve the number above it. The panel
  // footer says the rest in one line.
  const weaknessGaps = topWeaknesses.map((type) => ({
    label: `Answers ${type}`,
    query: counterQueryFor(type),
    gapType: type,
  }));

  // Evolution prerequisites, deduped across stages -- two Charizard lines both wanting Charmander
  // is one thing to buy, not two rows of the same tiles.
  //
  // Held empty until the deck has fully resolved, which is not cosmetic: `missingStages` grows as
  // each species lands, so firing on the partial list costs a query per wave that a complete list
  // would have made anyway. Measured -- ungated this page ran 28 commerce searches against a
  // pre-change baseline of 24; gated it holds at 24. It is the same `!isResolving` gate
  // SuggestedPickups sits behind below, applied to the half that moved out of it.
  const prerequisiteNames = isResolving
    ? []
    : [...new Set(missingStages.flatMap((m) => m.need))].slice(0, PREREQUISITE_ROWS);
  const { resolved: prerequisiteGaps } = useGapSuggestions(
    prerequisiteNames.map((name) => ({ label: name, query: name }))
  );

  // The evolution rules as ONE clamped sentence rather than the <ul> that used to sit above these
  // cards. Each row below is already headed by the prerequisite species, so a list of "Leafeon
  // evolves from Eevee" lines was restating the row labels -- and its variable length (seven lines
  // on Marcus's deck, one on a small one) is precisely what stopped the two columns' card rows
  // from starting at the same height.
  const evolutionSentence = missingStages
    .map((m) => `${m.for} needs ${m.need.join(' and ')}`)
    .join('; ');

  const rankedWeaknesses = weaknesses.slice(0, RANKED_BARS);

  // The collector read: completion per set, the printing checklist, holdings value and spares.
  // Rendered for BOTH personas -- only its position changes (above the deck grid for Dana, below it
  // for Marcus). Every number in it is deterministic, so this whole block still renders with the
  // narration API down, which is what makes the surface demo-resilient rather than quota-dependent.
  //
  // ONE SET LEADS. `read.sets` is already ordered closest-to-done first, so `sets[0]` is the only
  // one a shopper can realistically act on today and the rest are one-line rows that expand. See
  // CollectionPanels.tsx for why (direct feedback: four full cards carrying 48 checklist rows read
  // as a reference document rather than a page).
  const collectionSection =
    collection.read && collection.read.sets.length > 0 ? (
      (() => {
        return (
          <section className="mb-6 space-y-4">
            <PortfolioStrip read={collection.read!} />
            <SetCollector
              narration={<CollectionNarration read={collection.read} />}
              sets={collection.read!.sets}
              chip={
                <CoveoChip
                  capability="deck-check"
                  detailSuffix={`Set completion diffed against the live catalog: ${collection.read!.sets
                    .map((s) => `${s.setName} ${s.held}/${s.stocked}`)
                    .join(", ")}. Rosters and holdings each fetch in ONE batched query.`}
                />
              }
            />
            <VariantChecklistPanel gaps={collection.read!.variantGaps} />
            <SurplusStrip duplicates={collection.read!.duplicates} />
          </section>
        );
      })()
    ) : null;

  return (
      <PageShell>
        {/* The page's own top plate, carrying the same treatment and the same title/subtitle
            placement as /search's Card Consultant panel (2026-08-18, direct request). Structurally
            parallel to that panel on purpose: the h1 lives INSIDE the plate with the supporting
            line under it, rather than floating above it as a bare title row, so the two consultant
            surfaces open the same way.

            .panel-violet-bloom is the home hero's plate treatment as a background IMAGE, which is
            what lets it sit over this card's own bg-card -- see index.css for why a transparent
            panel would print the site-wide pokeball texture inside itself.

            The deck's headline read (Gemini's narration, then the deterministic biggest-hole
            sentence) moved UP into this plate from the left column below, which is what makes it
            "the first card area" rather than a title bar with a card under it. Both self-hide when
            they have nothing to say, so on an empty deck this is just the title and its line. */}
        {/* The hero FRAME is the app's one hero frame (2026-08-19, visual-consistency audit):
            `rounded-3xl` + `hero-border-glow` + `p-5 sm:p-6` + `mb-8`, the same four values the home
            hero (ConsultantHero), the Vault hero and the newsroom hero already carried. This plate
            was the odd one out on all four at once -- 16px corners against their 24px, no violet
            edge glow at all, no responsive padding step, and `mb-6` against their `mb-8` -- so the
            page that is meant to read as the Card Consultant's own full-page surface opened with a
            visibly different box than the surface it echoes. */}
        <div className="panel-violet-bloom hero-border-glow mb-8 rounded-3xl border border-border bg-card p-5 sm:p-6">
          <div className="flex items-center gap-2">
            <Compass className="h-6 w-6 shrink-0 text-primary" aria-hidden="true" />
            {/* ONE NAME FOR BOTH LENSES (gap-check-plan.md 5). "Deck Check" described only half
                of what this page does once the collector read landed, and the interim "What's
                Missing" named the QUESTION rather than the destination -- it read as a section
                heading. **Advisor** is the surface itself: the Card Consultant's own full-page
                read, of a deck and of a binder alike. The route was renamed with it this time
                (/deck-check -> /advisor, with a permanent redirect in App.tsx + vercel.json), so
                the URL and the h1 a click lands on finally say the same word. */}
            <PageTitle>Advisor</PageTitle>
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {/* Three readings, because the page genuinely does three things depending on who is
                looking. The empty-collection line matters most: promising "the deck you've built"
                to a visitor who has not built one describes a page they are not being shown. */}
            {collection.isEmptyCollection
              ? 'What a set costs to finish, priced from the live catalog — nothing here is assumed about you.'
              : collectorLeads
                ? 'Set completion, printings and type exposure for the cards you hold — read from the same live index the Card Consultant uses.'
                : 'Type exposure, evolution gaps, and budget for the deck you’ve built — read from the same live index the Card Consultant uses.'}
          </p>

          {/* THE NARRATIONS MOVED INTO THE CARDS THEY DESCRIBE (2026-08-19, direct request).
              This plate used to carry one Gemini paragraph for the whole page plus a
              ground-truth strip under it. There are two generated reads now, with different
              criteria, and each belongs inside the surface it is about: the deck read sits in
              Deck Advisor above its tabs, the collection read in Set Collector above its own.
              The deterministic biggest-hole sentence went with the deck one -- Deck Advisor
              pins it above its tab strip, so it is still never something you can navigate away
              from, it just no longer sits two screens above the thing it describes. */}
        </div>

        {deckLines.length === 0 && !deckResolving ? (
          /* NO HOLDINGS IS AN ANSWER, NOT A HOLE. Guest is never seeded, deliberately -- that empty
             state is the proof there is no hardcoding behind the other two personas. So rather than
             an apologetic "your deck is empty" box, the page answers the same question from zero:
             pick a set, here is what finishing it costs today. Same engine, same rosters, empty
             holdings list. Only falls back to the plain prompt if the rosters haven't landed. */
          collection.read && collection.read.sets.length > 0 ? (
            <StartFromSet sets={collection.read.sets} />
          ) : (
            <div className="rounded-2xl border border-border bg-card px-6 py-16 text-center">
              {/* The "read from the same live index" clause lives in the plate's subtitle directly
                  above this box now, so repeating it here would be the same sentence twice. */}
              <p className="text-sm text-muted-foreground">
                Your deck is empty. Add cards from any product page (&ldquo;Add to deck&rdquo;) and
                this page will diagnose it &mdash; type exposure, evolution gaps, and budget.
              </p>
              <Link to="/search" className="mt-4 inline-block text-sm font-semibold text-primary hover:underline">
                Browse cards &rarr;
              </Link>
            </div>
          )
        ) : (
          <>
          {collectorLeads && collectionSection}
          <DeckLens collapsed={collectorLeads}>
            <DeckAdvisor
              narration={
                <DeckHealthNarration
                  species={species}
                  topWeaknesses={topWeaknesses}
                  weaknessCounts={weaknessCounts}
                  missingStages={missingStages}
                  deckCardCount={deckCardCount}
                />
              }
              chip={
                <CoveoChip
                  capability="deck-check"
                  detailSuffix={`Read ${species.length} species from your deck: ${species
                    .map((sp) => sp.name)
                    .join(', ')}. Exposure, prerequisites and pickups all read the same live index.`}
                />
              }
              headline={
                topWeaknesses.length > 0 ? (
                  <>
                    Biggest hole:{' '}
                    <span className="font-semibold" style={{ color: typeColor(topWeaknesses[0]).bg }}>
                      {topWeaknesses[0]}
                    </span>
                    , shared by {weaknessCounts.get(topWeaknesses[0])} of {species.length} species.
                  </>
                ) : (
                  'No type exposure detected across this deck.'
                )
              }
              tabs={[
                {
                  id: 'exposure',
                  label: 'Type exposure',
                  stat:
                    weaknesses.length > 0
                      ? `${weaknesses.length} type${weaknesses.length === 1 ? '' : 's'}`
                      : 'none detected',
                  content: (
                    <>

                {rankedWeaknesses.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No shared weakness detected across this deck&apos;s species.
                  </p>
                ) : (
                  <>
                    {/* Ranked, most-shared first -- the order IS the finding. Each row links to the
                        same query its "Answers" pickup row re-runs, so the diagnosis and the
                        shopping trip can never disagree about what answering a type means. */}
                    <div className="space-y-2">
                      {rankedWeaknesses.map((type) => (
                        <Link
                          key={type}
                          to={`/search?q=${encodeURIComponent(counterQueryFor(type))}`}
                          className="block rounded-md px-1 py-0.5 hover:bg-muted/60"
                          title={`Find cards that answer ${type}`}
                        >
                          <ExposureBar type={type} count={weaknessCounts.get(type) ?? 0} total={species.length} />
                        </Link>
                      ))}
                    </div>
                    <p className="mt-2.5 text-2xs text-muted-foreground">
                      How much of your deck folds to each type. Click one to find cards that answer
                      it.
                    </p>
                  </>
                )}

                {/* The original 18-type grid, kept whole and moved one disclosure down. Its job is
                    the half the bars can't do: naming the types with NO exposure detected, without
                    ever calling them "covered" -- the index carries weaknesses, not resistances or
                    offensive coverage, so "no exposure detected" is the strongest true statement
                    available and the grid is where it gets made.

                    `<details>` rather than component state: this is exactly what the element is
                    for, and it keeps the disclosure keyboard-accessible without writing any of
                    that by hand. */}
                <details className="group mt-3 border-t border-border pt-3">
                  <summary className="flex cursor-pointer list-none items-center gap-1 text-2xs font-semibold text-muted-foreground hover:text-foreground">
                    <ChevronDown className="h-3 w-3 shrink-0 transition-transform group-open:rotate-180" aria-hidden />
                    All {ALL_TYPES.length} types
                  </summary>
                  <div className="mt-2.5 grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-4">
                    {ALL_TYPES.map((type) =>
                      weaknesses.includes(type) ? (
                        <Link key={type} to={`/search?q=${encodeURIComponent(counterQueryFor(type))}`}>
                          <TypeExposureTile type={type} count={weaknessCounts.get(type) ?? 0} />
                        </Link>
                      ) : (
                        <TypeExposureTile key={type} type={type} count={0} />
                      )
                    )}
                  </div>
                  <p className="mt-2.5 text-2xs text-muted-foreground">
                    Colored tiles are types at least one of your species is weak to. The rest have no
                    exposure detected in this deck &mdash; which is not the same as being covered
                    against them.
                  </p>
                </details>
                    </>
                  ),
                },
                ...(missingStages.length > 0
                  ? [
                      {
                        id: 'evolution',
                        label: 'To play these',
                        stat: `${missingStages.length} line${missingStages.length === 1 ? '' : 's'}`,
                        content: (
                          <GapPanel
                            bare
                            intro={evolutionSentence}
                            rows={prerequisiteGaps}
                            fallback={<p className="text-xs text-muted-foreground">Looking for the earlier stages…</p>}
                            footer={
                              <>
                                Unlike the weakness rows, buying these genuinely{' '}
                                <span className="font-semibold">closes</span> the gap — a deck cannot play an
                                evolution without the stage under it.
                              </>
                            }
                          />
                        ),
                      },
                    ]
                  : []),
                ...(weaknessGaps.length > 0
                  ? [
                      {
                        id: 'pickups',
                        label: 'Suggested pickups',
                        stat: `${weaknessGaps.length} gap${weaknessGaps.length === 1 ? '' : 's'}`,
                        content: <SuggestedPickups gaps={weaknessGaps} bare />,
                      },
                    ]
                  : []),
              ]}
            />

          </DeckLens>
          {!collectorLeads && collectionSection}
          </>
        )}
      </PageShell>
  );
}
