import { Link } from 'react-router-dom';
import { MessageCircleQuestion, Layers } from 'lucide-react';
import { CoveoChip } from '@/components/CoveoChip';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useDeckCheck } from '@/lib/deckCoverage';
import { typeColor } from '@/lib/typeColors';
import { useBrief } from '@/lib/consultationBrief';
import { formatPriceRange } from '@/lib/priceIntent';
import { BudgetBar } from '@/components/consultant/BudgetBar';

// The cart's own diagnosis: what this deck is exposed to, and what it can't legally play yet.
// "The Consultant's deck review" as of phase W3 (presentation/consultant-everywhere-plan.md) --
// same panel, reframed: each weakness is now its own actionable gap (not one combined link), and a
// budget bar reads the active consultation's stated budget against the cart's real total.
//
// Placement is deliberate -- directly above CartRecommendations, which is an ML slot. Read together
// they are the two halves of the same idea: a deterministic rule derived from the domain's own data
// sitting next to a pattern learned from behaviour. Diagnosis first, then the upsell, then checkout.
//
// Every claim here is traceable. Weaknesses come from the species' own Pokedex record, not a type
// chart in this file; the "needs earlier stages" line is the TCG's actual evolution rule applied to
// the record's own chain. Each gap chip is a plain /search URL that re-enters the already-shipped
// matchup advisor -- the same sentence shape as the home Card Consultant chip, with the cart's real
// weakness (and the active budget, if any) substituted in.
//
// IT SAYS WHICH DECK IT IS READING, and this is not cosmetic. There are two deck surfaces in this
// app reading two DIFFERENT lists through the same `useDeckCheck` hook: this one reads the cart,
// and /advisor reads the persisted per-persona "My Deck" (deckStorage.ts). The separation is
// deliberate and load-bearing -- see that file's note on why a deck and a cart cannot be the same
// list -- but until this round both surfaces were titled "deck review" with nothing saying which
// cards they had read, so adding a card here and clicking through to /advisor showed a shopper
// a completely different set of species with no explanation. The architecture was right and the
// labels were hiding it. The title now names the cart, and the line under it names the other
// surface and links to it.

interface Props {
  items: readonly { name: string; price: number; quantity: number }[];
}

function TypePill({ name }: { name: string }) {
  const { bg, text } = typeColor(name);
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-bold"
      style={{ backgroundColor: bg, color: text }}
    >
      {name}
    </span>
  );
}

export function DeckCoverage({ items }: Props) {
  const { species, weaknesses, missingStages, isResolving } = useDeckCheck(items);
  const brief = useBrief();

  // Nothing to say until at least one card resolved to a species. A cart of Trainers and Energy is
  // a perfectly normal cart, and this panel staying invisible is the correct response to it --
  // same contract CartRecommendations uses for a slot with nothing to show.
  if (species.length === 0) return null;

  // Each gap chip carries the active budget along, if one exists -- "weak to Water" and "weak to
  // Water under $25" are different searches, and the consultation already knows which one applies.
  const counterQueryFor = (type: string) =>
    brief?.budget ? `Beat ${type} types under ${formatPriceRange(brief.budget)}` : `Beat ${type} types`;

  const cartTotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);

  return (
    // Same Card Consultant chrome as CardConsultant.tsx/ConsultantPanel.tsx -- title in
    // `text-primary`, same header/content structure -- but the card itself carries the identical
    // violet plate the home hero uses (`panel-violet-fill` + `panel-border-glow`, the same pairing
    // BrowseTiles.tsx applies to Shop by set / Browse the Pokédex), on request, rather than a flat
    // `bg-card` like the plain order-summary panel below it.
    <Card className="panel-violet-fill panel-border-glow">
      <CardHeader className="gap-1.5 p-4 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base text-primary">
            <MessageCircleQuestion className="h-4 w-4 shrink-0" aria-hidden />
            This cart as a deck
          </CardTitle>
          <CoveoChip
            capability="deck-check"
            detailSuffix={`Read ${species.length} species from this cart: ${species.map((s) => s.name).join(', ')}.`}
          />
        </div>
        <p className="text-2xs text-muted-foreground">
          The Consultant&apos;s review of what you&apos;re buying &mdash; your saved deck is on{' '}
          <Link to="/advisor" className="font-semibold text-primary hover:underline">
            the Advisor
          </Link>
          .
        </p>
      </CardHeader>

      <CardContent className="flex flex-col gap-2 p-4 pt-0">
        {weaknesses.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span>Weak to</span>
            {/* Each pill is its own action now, not a decorative label under one combined link --
                "weak to Grass" IS "find Grass counters", one click apart. */}
            {weaknesses.map((w) => (
              <Link
                key={w}
                to={`/search?q=${encodeURIComponent(counterQueryFor(w))}`}
                className="card-hover rounded-full"
                title={`Find cards that counter ${w}`}
              >
                <TypePill name={w} />
              </Link>
            ))}
          </div>
        )}

        {brief?.budget && (
          <div className="border-t border-accent-secondary/20 pt-2">
            <BudgetBar total={cartTotal} budget={brief.budget} />
          </div>
        )}

        {missingStages.length > 0 && (
          <div className="border-t border-accent-secondary/20 pt-2">
            <span className="eyebrow flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
              To play these, you also need
            </span>
            <ul className="mt-1.5 space-y-1">
              {missingStages.map((m) => (
                <li key={m.for} className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{m.for}</span> evolves from{' '}
                  {m.need.map((n, i) => (
                    <span key={n}>
                      {i > 0 && ', '}
                      <Link to={`/search?q=${encodeURIComponent(n)}`} className="font-semibold text-primary hover:underline">
                        {n}
                      </Link>
                    </span>
                  ))}
                </li>
              ))}
            </ul>
          </div>
        )}

        {isResolving && <p className="text-2xs text-muted-foreground">Checking the rest of the cart…</p>}
      </CardContent>
    </Card>
  );
}
