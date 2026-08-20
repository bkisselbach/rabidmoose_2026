// Card surface audit -- "are these tiles telling the same story?"
//
// Run: node scripts/card-audit.mjs        (needs `npm run dev` on :5173)
//      CARD_AUDIT_URL=https://... node scripts/card-audit.mjs
//
// WHY THIS EXISTS. On 2026-08-17 a card grid shipped where some tiles showed a product name and
// some did not, because a rule ("hide the name when it matches the species") was invisible to a
// reader and therefore indistinguishable from a bug. It was caught by a human looking at a
// screenshot. Everything below is the same class of defect expressed as a number instead.
//
// Same discipline as catalog-scraper's relevancy scorecard and scripts/consultant-reliability-panel:
// a FIXED set of surfaces, ASSERTED, not eyeballed once. Exits non-zero so it can gate.
//
// FOUR TRAPS THIS PAGE SETS, each of which made an ad-hoc probe report a WORKING feature as broken
// while the change that "failed" was fine. They are why the selectors below look fussy:
//
//  1. TWO card containers. `/search` renders [data-testid="product-card"] in the Card Consultant
//     panel AND in the PLP grid, with products repeating across both. Anything asserting on order
//     or counts must scope to `.deal-in` (the grid's per-tile wrapper).
//  2. CSS uppercase. `.eyebrow` and the identity strip are `text-transform: uppercase`, so
//     innerText returns "ULTRA", not "Ultra". Match case-insensitively, always.
//  3. textContent WELDS elements together. Reading a detached clone's textContent turned
//     "· EX" + "Evolutions (2016)" into "EXEvolutions", destroying the word boundary and hiding a
//     token that was plainly on screen. Read innerText from the LIVE node; subtract by string.
//  4. "POKEDEX" CONTAINS "EX". Any substring test for a printing designation must exclude the
//     Pokedex line first, or every `ex` card looks covered when none are.

const BASE = process.env.CARD_AUDIT_URL || 'http://localhost:5173';
const SETTLE_MS = Number(process.env.CARD_AUDIT_SETTLE_MS || 10000);

const SURFACES = [
  { name: 'home (rails)', path: '/' },
  { name: '/search grid', path: '/search?q=charizard' },
  { name: '/search browse', path: '/search' },
  { name: 'species page', path: '/pokedex/charizard' },
];

// Rarity values that are NOT a holo printing. Mirrors lib/rarityLabel.ts's NON_HOLO -- if that
// list changes and this one does not, the foil-gate check below starts failing, which is the
// intended alarm rather than a nuisance.
const NON_HOLO = ['common', 'uncommon', 'rare'];

const { chromium } = await import('playwright-core');
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1600, height: 1300 } });

/** One row per card, with the features this app's card rules are written in terms of. */
async function readSurface(path) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(SETTLE_MS);
  return page.evaluate(() => {
    const cards = [...document.querySelectorAll('[data-testid="product-card"]')];
    return cards.map((c) => {
      const strip = c.querySelector('span[title]');
      const dex = [...c.querySelectorAll('a')].find((a) => (a.getAttribute('href') ?? '').startsWith('/pokedex/'));
      // Trap 3 + 4: live innerText, with the Pokedex line subtracted as a STRING.
      const text = dex ? c.innerText.split(dex.innerText).join('\n') : c.innerText;
      const chips = [...c.querySelectorAll('div')].filter(
        (d) => /rounded-sm/.test(typeof d.className === 'string' ? d.className : '') && d.innerText.trim()
      );
      const merch = chips.filter((d) => (d.getAttribute('title') ?? '').includes('Merchandiser'));
      return {
        identity: strip?.innerText.trim() ?? '',
        identityTitle: strip?.getAttribute('title') ?? '',
        truncated: strip ? strip.scrollWidth > strip.clientWidth + 1 : false,
        hasName: !!c.querySelector('[data-testid="product-name"]'),
        hasDex: !!dex,
        merchCount: merch.length,
        // Any chip that is NOT a merch badge, a rank, or Featured. Under the 2026-08-17 rule
        // (chips = merchandiser decisions, text = card facts) there should be none.
        strayChips: chips
          .filter((d) => !merch.includes(d))
          .map((d) => d.innerText.trim())
          .filter((t) => !/^#\d+$/.test(t) && !/^featured$/i.test(t)),
        foil: !!c.querySelector('.holo-foil'),
        text,
      };
    });
  });
}

const failures = [];
const notes = [];
const check = (ok, label, detail) => {
  if (!ok) failures.push(`${label}: ${detail}`);
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` -- ${detail}` : ''}`);
};

let sawMultiBadge = false;

for (const surface of SURFACES) {
  const cards = await readSurface(surface.path);
  console.log(`\n${surface.name}  (${cards.length} cards)`);
  if (!cards.length) {
    notes.push(`${surface.name}: no cards rendered -- surface skipped, not asserted`);
    console.log('  --   no cards rendered; nothing asserted');
    continue;
  }

  // 1. Rarity is text, never a chip. This is the rule the whole restyle rests on.
  const stray = cards.flatMap((c) => c.strayChips);
  check(stray.length === 0, 'no non-merchandiser chips', stray.length ? [...new Set(stray)].join(', ') : '');

  // 2. Every card states its identity. A tile with no identity line is the "some tiles differ"
  //    defect in its purest form.
  const noIdentity = cards.filter((c) => !c.identity).length;
  check(noIdentity === 0, 'every card has an identity line', noIdentity ? `${noIdentity} without one` : '');

  // 3. Name and Pokedex line are alternatives, never both -- one of them owns the title slot.
  const both = cards.filter((c) => c.hasName && c.hasDex).length;
  check(both === 0, 'name and Pokedex line are exclusive', both ? `${both} show both` : '');

  // 4. The foil gate is honest: it tracks indexed rarity, not decoration.
  const wrongFoil = cards.filter(
    (c) => c.foil && NON_HOLO.some((r) => new RegExp(`\\b${r}\\b`, 'i').test(c.identity))
  );
  check(wrongFoil.length === 0, 'foil only on holo printings', wrongFoil.length ? wrongFoil.map((c) => c.identity).join(' | ') : `${cards.filter((c) => c.foil).length}/${cards.length} foiled`);

  // 5. The identity line has to actually fit, or the information it carries is theatre.
  const clipped = cards.filter((c) => c.truncated).length;
  check(clipped / cards.length <= 0.15, 'identity line fits (<=15% clipped)', `${clipped}/${cards.length} clipped`);

  if (cards.some((c) => c.merchCount > 1)) sawMultiBadge = true;
  console.log(`  --   ${cards.filter((c) => c.merchCount > 0).length}/${cards.length} badged, ${cards.reduce((a, c) => a + c.merchCount, 0)} badges total`);
}

// Cross-surface: badge STACKING is a documented demo beat (demo-capabilities-map rows 66/89) that
// was impossible until badgeQueue stopped keeping only badges[0]. If no surface ever shows two,
// either the regression is back or the placement stopped returning multiples.
console.log('\ncross-surface');
check(sawMultiBadge, 'badge stacking still works somewhere', sawMultiBadge ? '' : 'no card anywhere showed >1 merchandiser badge');

console.log(`\n${failures.length ? `${failures.length} FAILURE(S)` : 'all checks passed'}`);
for (const n of notes) console.log(`note: ${n}`);
for (const f of failures) console.log(`  - ${f}`);

await browser.close();
process.exit(failures.length ? 1 : 0);
