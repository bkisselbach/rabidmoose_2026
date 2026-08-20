import { formatCurrency } from '@/lib/currency';
import type { CollectionRead } from '@/lib/gapEngine';

// Client for the COLLECTION lens of api/deck-health.ts. Same never-throws-self-hides contract as
// deckHealthNarration.ts: a narration failure degrades to no narration, never to a broken page.
//
// WHAT IT SENDS, AND WHAT IT DELIBERATELY DOES NOT. The payload is the completion arithmetic the
// page already computed -- per set: how much is held, how much is left, what finishing costs, how
// much of that bill is the cheap tail, and the single dearest missing card. Plus the printing gaps
// and a duplicate count.
//
// It does NOT send `movement`. The cost basis behind that number is mock demo data (there is no
// order history in this app and no price history in the catalog), and handing a model a
// gain/loss figure is handing it an invitation to narrate an investment story the data cannot
// support. The number stays on screen, labelled as mock, where a reader can see exactly what it is
// -- it just never becomes prose. The system instruction forbids appreciation claims as well; this
// is the belt to that pair of braces.

// MONEY GOES OVER PRE-FORMATTED, as "$185.98" rather than 185.98.
//
// Measured on the first live run: given raw numbers, the model formatted them inconsistently --
// Dana's read produced "$4,636.44" while Marcus's produced "250.99 dollar valuation" and "518.50
// to finish" in the same paragraph. Same prompt, same lens; the drift is the model's, not ours.
//
// Formatting here with the app's OWN formatter fixes more than the wobble: the prose now quotes
// the identical string the tabs underneath it render, so a reader comparing the narration to the
// numbers on screen sees them agree character for character. The system instruction tells the
// model these are already formatted and must be reproduced verbatim.
export async function narrateCollection(
  read: CollectionRead,
  personaContext: { name: string; subtitle: string } | undefined,
  signal?: AbortSignal
): Promise<string | null> {
  try {
    const res = await fetch('/api/deck-health', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lens: 'collection',
        cardsHeld: read.cardsHeld,
        marketValue: formatCurrency(read.marketValue),
        // BOTH PICKS ARE COMPUTED HERE, not left to the model to derive from the array.
        //
        // Measured on Marcus 2026-08-20: given a percent-sorted array, the read named Scarlet &
        // Violet (1%) as the set he is closest to finishing while Evolving Skies (6%) sat first
        // in the same array and open in the tab strip underneath. The ordering was right and the
        // model read past it -- so the ordering stops being the carrier of the claim. Same rule
        // the rest of this page follows: if a number is derivable, derive it and send the answer.
        closestToFinishing: [...read.sets].sort((a, b) => b.percent - a.percent)[0]?.setName,
        cheapestToFinish: [...read.sets].sort((a, b) => a.costToComplete - b.costToComplete)[0]?.setName,
        sets: read.sets.map((s) => ({
          setName: s.setName,
          percent: s.percent,
          held: s.held,
          stocked: s.stocked,
          missingCount: s.missing.length,
          costToComplete: formatCurrency(s.costToComplete),
          cheapTail: { count: s.cheapTail.count, cost: formatCurrency(s.cheapTail.cost) },
          chaseTop: s.chase[0] ? { name: s.chase[0].name, price: formatCurrency(s.chase[0].price) } : undefined,
        })),
        // Only the ones that actually represent a gap, and only a handful: the model needs enough
        // to say something specific, not the whole checklist.
        variantGaps: read.variantGaps
          .filter((g) => g.held && g.missing.length > 0)
          .slice(0, 4)
          .map((g) => ({
            card: g.card.name,
            held: g.held?.label ?? '',
            missing: g.missing.map((m) => ({ label: m.label, price: formatCurrency(m.marketPrice) })),
          })),
        duplicateCount: read.duplicates.length,
        personaContext,
      }),
      signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.text === 'string' && data.text.length > 0 ? data.text : null;
  } catch {
    return null;
  }
}
