/**
 * A12 screenshot capture (deck-outline.md's capture list).
 *
 * The original script (commit 145b458) was swept out of the tree; this is the rebuild, and it
 * covers the two shots that were still outstanding:
 *
 *   #6  Consultant answer on /search with grounded tiles  -- the T1-S11 fallback, quota-gated
 *   #12 /advisor under Marcus, Deck Advisor leading       -- the other half of the #11/#12 pair
 *
 * Both run against PROD by default, because the T1-S11 fallback has to be a picture of the thing the
 * room will be looking at. Point CAPTURE_BASE at the dev server only for framing experiments.
 *
 * Usage:  node scripts/capture-screens.mjs [6|12|all]
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = process.env.CAPTURE_BASE ?? 'https://www.rabidmoose.com';
const OUT = resolve(process.cwd(), '../presentation/screenshots');
mkdirSync(OUT, { recursive: true });

// The capture list says 1440px. Height is generous so a long consultant turn stays in one frame;
// each shot is clipped to its own element anyway, so the viewport only sets layout breakpoints.
const VIEWPORT = { width: 1440, height: 1400 };

// localStorage key from src/lib/visitorId.ts. Seeded via addInitScript so the very first render is
// already the right persona -- switchPersona() reloads the page, which would race the capture.
const PERSONA_KEY = 'pokemon-tcg-active-persona';

const QUESTION =
  process.env.CAPTURE_Q ?? 'Which Charizard card should I buy under $80, and what beats it?';

async function newPage(browser, persona) {
  const ctx = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    colorScheme: 'dark',
  });
  await ctx.addInitScript(
    ([key, value]) => {
      try {
        // ONLY if unset. addInitScript runs on every navigation including reloads, and
        // switchPersona() reloads by design (visitorId.ts) -- an unconditional write here put the
        // starting persona back and silently undid the switch #7 exists to capture.
        if (!window.localStorage.getItem(key)) window.localStorage.setItem(key, value);
      } catch {
        /* private mode; the capture still runs, just as Guest */
      }
    },
    [PERSONA_KEY, persona],
  );
  return ctx.newPage();
}

/** Does the LAST turn carry grounded tiles? Gemini's tool-calling is non-deterministic (panel-script
 *  [S13] states this as a finding, not a bug): the same question sometimes skips the catalog search
 *  entirely, and the turn then correctly renders no tiles at all. A page-wide tile count cannot tell
 *  that apart from success, because the browse-mode answer that lands on page load carries tiles of
 *  its own. So ask the DOM whether any tile *follows* our question node. */
function tilesOnOurTurn(page, question) {
  return page.evaluate((q) => {
    const asked = [...document.querySelectorAll('div,p,span')]
      .filter((n) => n.textContent?.trim() === q)
      .pop();
    if (!asked) return 0;
    const tiles = [...document.querySelectorAll('a[href^="/card/"], a[href^="/pokemon/"]')];
    return tiles.filter((t) => asked.compareDocumentPosition(t) & 4).length; // FOLLOWING
  }, question);
}

// Tiles link to /card/:id (catalog) and /pokedex/:name (species) -- both corpora in one row, which
// is exactly the federation claim this shot is the fallback for.
const TILE_SELECTOR = 'a[href^="/card/"], a[href^="/pokedex/"]';

/** Ask the question through the URL rather than the follow-up composer.
 *
 *  Both paths run the same agent, but the composer path leaves the browse-mode answer that landed
 *  on page load sitting above ours in a transcript that only scrolls 268px, so a capture either
 *  clips a sliver of that earlier turn or loses our own tiles off the bottom. Driving the query
 *  from the URL makes the thread exactly one exchange, and the panel then frames itself. */
async function capture6(browser, attempt = 1) {
  const page = await newPage(browser, 'marcus');
  await page.goto(BASE + '/search?q=' + encodeURIComponent(QUESTION), { waitUntil: 'domcontentloaded' });

  const panel = page
    .getByText('Card Consultant', { exact: true })
    .locator('xpath=ancestor::div[.//input[@placeholder]][1]');
  await panel.waitFor({ timeout: 30000 });

  // Gemini's tool-calling is non-deterministic -- panel-script [S13] states this as a finding, not a
  // bug: the same question sometimes skips the catalog search entirely and the turn then correctly
  // renders no tiles rather than inventing any. Scope the count to the PANEL: the result list below
  // is full of /card/ links and a page-wide count cannot tell a grounded turn from an empty one.
  let tiles = 0;
  for (let i = 0; i < 30 && tiles === 0; i++) {
    await page.waitForTimeout(1000);
    tiles = await panel.locator(TILE_SELECTOR).count();
  }
  if (tiles === 0) {
    await page.close();
    if (attempt >= 4) throw new Error('#6: four runs answered with no grounded tiles');
    console.log('#6  attempt ' + attempt + ': no tiles on that turn (non-determinism) -- retrying');
    return capture6(browser, attempt + 1);
  }
  await page.waitForTimeout(3000); // tile images + the staggered ripple

  // The card is a fixed 28rem chat shell (ConsultantPanel.tsx explains why it is a height and not
  // a max-height), so a nine-tile turn is always taller than the ~268px that actually scrolls.
  // Bottom is the right end to lose: it holds the tile LABELS, and an unlabelled tile row is not
  // evidence of anything. Scroll the transcript, never the window -- scrollIntoView() drags the
  // page under the sticky header and takes the panel title with it.
  await page.evaluate(() => {
    const sc = [...document.querySelectorAll('div')].find(
      (d) =>
        /(auto|scroll)/.test(getComputedStyle(d).overflowY) &&
        d.scrollHeight > d.clientHeight &&
        d.querySelector('a[href^="/card/"]'),
    );
    if (sc) sc.scrollTop = sc.scrollHeight;
  });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(600);

  const path = OUT + '/06-consultant-grounded-tiles.png';
  await panel.screenshot({ path });
  const species = await panel.locator('a[href^="/pokedex/"]').count();
  console.log(
    '#6  -> ' + path + '  (grounded tiles: ' + tiles + ', of which species: ' + species + ')',
  );
  await page.close();
}

/** #11 and #12 are the same page under two shoppers, and the PAIR is the claim -- "persona chooses
 *  which analysis leads, never which one exists". Which is why Dana's capture opens her collapsed
 *  deck half: left shut, the shot shows a surface that appears to be missing, which is the exact
 *  opposite of what the pair is evidence for. */
async function captureAdvisor(browser, persona, file) {
  const page = await newPage(browser, persona);
  await page.goto(BASE + '/advisor', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(11000); // batched catalog read + both narration lenses

  // Dana leads with the collector half, so the deck half renders inside a <details> (AdvisorPage
  // DeckLens). Marcus has no such summary and this is a no-op for him.
  const summary = page.getByText('Deck Advisor — how this collection would play');
  if (await summary.count()) {
    await summary.first().click();
    await page.waitForTimeout(2500);
  }

  // Hide the Event Tape's floating launcher. It is `position: fixed`, so on a full-page shot it
  // parks itself over whatever happens to be at that viewport spot -- on Dana that is the middle
  // of the deck-health narration, with two words of generated prose underneath it. The tape has
  // its own capture (#7) where it is the subject; here it is an overlay sitting on the evidence.
  await page.evaluate(() => {
    // Match on COMPUTED POSITION, not on text or class. The launcher's textContent is "Events1"
    // (label plus its unread badge), which defeats an exact-text match, and it is the button
    // itself that is fixed, which defeats a leaf-node match. There is exactly one fixed element
    // on this route; hiding by what it DOES rather than what it says survives both.
    for (const el of document.querySelectorAll('*')) {
      if (getComputedStyle(el).position === 'fixed') el.style.visibility = 'hidden';
    }
  });
  // Clip at the end of the last panel. A fullPage shot on this route runs ~4400px and the last
  // third is site footer plus the min-height gap under a short page -- neither is the evidence.
  const height = await contentHeight(page);
  const path = OUT + '/' + file;
  await page.screenshot({ path, fullPage: true, clip: { x: 0, y: 0, width: VIEWPORT.width, height } });
  const heads = (await page.locator('h1, h2, h3').allInnerTexts()).filter(Boolean);
  console.log(persona + ' -> ' + path + '  (panels: ' + heads.join(' | ') + ')');
  await page.close();
}
/** Union bounding box of some locators, in PAGE coordinates, for a `fullPage` clip. */
async function clipOf(page, locators, pad = 16) {
  const boxes = [];
  const scrollY = await page.evaluate(() => window.scrollY);
  for (const loc of locators) {
    const n = await loc.count();
    for (let i = 0; i < n; i++) {
      const b = await loc.nth(i).boundingBox();
      if (b) boxes.push({ ...b, y: b.y + scrollY });
    }
  }
  if (!boxes.length) return null;
  const x = Math.max(0, Math.min(...boxes.map((b) => b.x)) - pad);
  const y = Math.max(0, Math.min(...boxes.map((b) => b.y)) - pad);
  const right = Math.max(...boxes.map((b) => b.x + b.width));
  const bottom = Math.max(...boxes.map((b) => b.y + b.height));
  return { x, y, width: Math.min(VIEWPORT.width - x, right - x + pad * 2), height: bottom - y + pad * 2 };
}

/** Height of the page's real content: the LOWEST BOTTOM EDGE among `main`'s children, not the last
 *  child's. On the PDP `main` ends with a zero-height node, so `lastElementChild` collapsed the
 *  clip to 24px and wrote a blank 2880x48 PNG (measured 2026-08-20). Taking the maximum is right
 *  either way and still crops the min-height gap and the site footer, which is the point. */
async function contentHeight(page) {
  return page.evaluate(() => {
    const main = document.querySelector('main');
    if (!main) return document.body.scrollHeight;
    const bottoms = [...main.children]
      .map((el) => el.getBoundingClientRect().bottom)
      .filter((b) => b > 0);
    const bottom = bottoms.length ? Math.max(...bottoms) : main.getBoundingClientRect().bottom;
    return Math.ceil(bottom + window.scrollY + 24);
  });
}
/** The Event Tape launcher is `position: fixed`, so on a full-page shot it parks over whatever sits
 *  at that viewport spot. Hidden for every page capture; #7 is the one shot where the tape IS the
 *  subject, and that one opens it deliberately. */
async function hideFixedOverlays(page) {
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('*')) {
      if (getComputedStyle(el).position === 'fixed') el.style.visibility = 'hidden';
    }
  });
}

/** Card images are `loading="lazy"` (item 31e), so anything below the fold is a blank tile in a
 *  full-page shot. Walk the page once to trigger them, then come back. */
async function loadLazyImages(page) {
  await page.evaluate(async () => {
    const step = Math.round(window.innerHeight * 0.9);
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 250));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(1500);
}

/** Scrolls `locator` to just under the sticky header and takes a VIEWPORT shot from there.
 *  Preferred over a full-page clip wherever the frame wants "this band of the page": the content is
 *  on screen, so lazy images are real, and the frame cannot silently run to the footer. */
async function shotFrom(page, locator, path, headerPad = 12) {
  await locator.evaluate((el, pad) => {
    const header = document.querySelector('header');
    const offset = (header?.getBoundingClientRect().height ?? 0) + pad;
    window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - offset);
  }, headerPad);
  await page.waitForTimeout(1600);
  await page.screenshot({ path });
}

// #1 -- /search?q=charizard, cards AND the species strip in one frame. The strip is the federation
// tell on this page, so the frame starts at the strip and runs down into the results.
//
// NOT anchored on `a[href^="/card/"]`: the Card Consultant panel above the results is full of them
// (its grounded tiles are card links), so a union clip over that selector starts inside the panel
// and, having no bottom anchor in the grid, runs all the way to the site footer. Measured on the
// first attempt -- the shot came out 4,566px tall with a row of blank lazy tiles in it.
async function capture1(browser) {
  const page = await newPage(browser, 'marcus');
  await page.goto(BASE + '/search?q=charizard', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(12000);
  await loadLazyImages(page);
  await hideFixedOverlays(page);
  // Anchored on the strip's own heading, not its first tile: the tile sits ~90px lower, which
  // leaves the bottom edge of the consultant panel cut across the top of the frame.
  const strip = page.getByText(/Pok.mon matches/).first();
  const path = OUT + '/01-search-cards-and-species.png';
  await shotFrom(page, strip, path);
  console.log('#1  -> ' + path + '  (species=' + (await page.locator('a[href^="/pokedex/"]').count()) +
    ' cards=' + (await page.locator('a[href^="/card/"]').count()) + ')');
  await page.close();
}

// #9 -- the `onix` list with Onix GX pinned at #1 and its FEATURED badge visible. The badge labels
// are CSS-uppercased, so they are matched on `title`, never on rendered text (a lesson from item
// 31d, where an innerText match on "Rare Find" nearly got a working feature deleted).
async function capture9(browser) {
  const page = await newPage(browser, 'marcus');
  await page.goto(BASE + '/search?q=onix', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(12000);
  await hideFixedOverlays(page);
  const cards = page.locator('a[href^="/card/"]');
  const clip = await clipOf(page, [cards.nth(0), cards.nth(4)]);
  const path = OUT + '/09-onix-featured.png';
  await page.screenshot({ path, fullPage: true, clip: clip ?? undefined });
  const first = (await cards.first().innerText()).replace(/\n/g, ' ').slice(0, 60);
  const featured = await page.locator('[title*="Featured" i], [title*="featured" i]').count();
  console.log('#9  -> ' + path + '  (first result: ' + first + ' | featured badges: ' + featured + ')');
  await page.close();
}

// #8 -- the PDP. The capture list still calls this "with the Coveo lens ON"; that switch no longer
// exists (SiteHeader removed the gear with it) because the markers are unconditional now, so there
// is nothing to turn on and the shot is simply the page.
async function capture8(browser) {
  const page = await newPage(browser, 'marcus');

  // The fit strip reads the consultation Brief, which is session-scoped and persona-keyed
  // (lib/consultationBrief.ts) -- on a cold PDP there is no Brief and the strip correctly renders
  // nothing. So the Brief is EARNED first, by asking the consultant a real strategy question on
  // /search; the PDP then has something to be a fit against.
  //
  // GRASS, not Water, and that pairing is forced from both ends. The strip only speaks when the
  // species actually counters the brief's target (ConsultantFitStrip pushes no clause otherwise),
  // so a 'beat Water' plan on Charizard correctly renders NOTHING -- measured. And the card cannot
  // just be swapped for an Electric one, because the graded-market panel this shot also needs is
  // live on exactly ONE document in the catalogue (base1-4). Charizard is Fire, Fire beats Grass:
  // one card that can carry both halves of the frame.
  //
  // The phrasing matters and is not interchangeable. "I keep losing to Grass decks and my budget
  // is $50" -- almost exactly the home hero's own invitation, "tell us what you keep losing to" --
  // writes NO brief at all: the intent parser does not read it as advisory. "what beats grass
  // decks" writes one with targets [Grass] and counterTypes [Flying, Ice, Fire, Poison, Bug].
  // Measured 2026-08-20, and worth knowing before anyone types the hero's sentence on stage.
  await page.goto(
    BASE + '/search?q=' + encodeURIComponent('what beats grass decks'),
    { waitUntil: 'domcontentloaded' }
  );
  await page.waitForTimeout(15000);

  await page.goto(BASE + '/card/base1-4', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(13000);
  await loadLazyImages(page);
  await hideFixedOverlays(page);
  const height = await contentHeight(page);
  const path = OUT + '/08-pdp-coveo-marks.png';
  await page.screenshot({ path, fullPage: true, clip: { x: 0, y: 0, width: VIEWPORT.width, height } });
  const body = await page.locator('main').innerText();
  console.log('#8  -> ' + path + '  (fit strip: ' + /Fits your plan|fits your plan/.test(body) +
    ', graded market: ' + /PSA 10/.test(body) + ', rec rails: ' + /PICKED BY COVEO ML/i.test(body) + ')');
  await page.close();
}

// #5 -- the typeahead mid-type: suggestion rows, instant products AND the Pokedex tile row, which
// is the one that shows two corpora answering the same keystroke.
//
// TAKEN ON /search, NOT THE HOME HERO, and that is a workaround for a live defect rather than a
// preference. On home the panel paints UNDER the Trending rail: `.deal-in` uses
// animation-fill-mode `both`, so the entrance animation stays in effect forever and Chromium
// computes an identity transform, which still creates a stacking context -- permanently sealing
// every section's z-index. Hero and rails each sit in one, so DOM order decides and the later
// section wins. /search's box has no such wrapper and paints clean over the results (verified by
// hit-testing the panel's bottom edge: it lands on the panel's own LI, not on a result card).
//
// `charizard` rather than `char`: the Pokedex tile row needs a species match, and a bare prefix
// does not make one. Measured -- char: 8 suggestions / 4 products / 0 species; chariz: 3/4/0;
// charizard: 3/4/1. Only the full name lights all three rows the capture list asks for.
async function capture5(browser) {
  const page = await newPage(browser, 'marcus');
  await page.goto(BASE + '/search', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(11000);
  const box = page.locator('main input[type="text"], main input[type="search"]').first();
  await box.click();
  await box.type('charizard', { delay: 120 });
  // No Enter, deliberately -- the shot is the panel open OVER the page, not the results it leads to.
  await page.waitForTimeout(6000);
  await hideFixedOverlays(page);
  const path = OUT + '/05-typeahead-charizard.png';
  await page.screenshot({ path });
  const counts = await page.evaluate(() => {
    const lb = document.querySelector('[role="listbox"]');
    let pop = lb;
    while (pop && !String(pop.className).includes('popover-content')) pop = pop.parentElement;
    const scope = pop || document;
    return {
      s: scope.querySelectorAll('[role="option"]').length,
      p: scope.querySelectorAll('a[href^="/card/"]').length,
      d: scope.querySelectorAll('a[href^="/pokedex/"]').length,
    };
  });
  console.log('#5  -> ' + path + '  (suggestions: ' + counts.s + ', products: ' + counts.p +
    ', pokedex tiles: ' + counts.d + ')');
  await page.close();
}
// #7 -- the Event Tape holding a REAL click row and a `personaSwitch marcus` row.
//
// Both are earned rather than staged: the click row comes from actually opening a product, the
// persona row from actually using the switcher (ProfileSwitcher logs it). The switch reloads the
// page -- switchPersona() does that on purpose, see visitorId.ts -- and the tape survives it
// because it is sessionStorage-backed, which is the property that makes this shot possible.
async function capture7(browser) {
  const page = await newPage(browser, 'dana');
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(12000);

  // The click comes from a HOME RAIL, not a search result, and that is a finding rather than a
  // preference: `useInteractiveProducts` (item 31c) is wired to the recommendation surfaces --
  // Trending, Where you left off, cart and empty-state recs -- and NOT to the /search grid, so a
  // search-result click emits no `ec.productClick` at all. Measured 2026-08-20: clicking a result
  // produced only the PDP's `ec.productView`. A rail click is a real click and does emit one.
  // Scoped to the Trending rail. The FIRST card link on the home page belongs to the hero's
  // decorative card stack -- absolutely positioned and overlapping, so Playwright never gets a
  // stable hit -- and it is not a recommendation surface anyway.
  const rail = page
    .getByText('Trending now', { exact: false })
    .first()
    .locator('xpath=ancestor::section[1]');
  await rail.locator('a[href^="/card/"]').first().click();
  await page.waitForTimeout(7000);

  await page.locator('header button').filter({ hasText: 'Dana' }).first().click();
  await page.waitForTimeout(1200);
  await page.getByText('Marcus Hale', { exact: false }).first().click();
  await page.waitForTimeout(9000);

  // The one capture where the fixed launcher is the subject, so it is NOT hidden here.
  await page.locator('button').filter({ hasText: /^Events/ }).first().click();
  await page.waitForTimeout(2500);

  const path = OUT + '/07-event-tape.png';
  await page.screenshot({ path });
  const body = await page.locator('body').innerText();
  console.log('#7  -> ' + path + '  (personaSwitch row: ' + /personaSwitch/i.test(body) +
    ', productClick row: ' + /productClick/i.test(body) + ')');
  await page.close();
}

// #10 -- the two rec rails side by side across personas. The beat's point is the DIFFERENCE
// (panel-script [S9]: "Recently Viewed personalizes per visitor"), so a single rail is not a usable
// fallback -- which is why this composes both into ONE asset rather than shipping two files a deck
// can accidentally separate.
async function captureRail(browser, persona, file) {
  const page = await newPage(browser, persona);
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(11000);
  await loadLazyImages(page);
  await hideFixedOverlays(page);
  const label = page.getByText('Where you left off', { exact: false }).first();
  const section = label.locator('xpath=ancestor::section[1]');
  const target = (await section.count()) ? section : label;
  const path = OUT + '/' + file;
  await target.screenshot({ path });
  console.log('    rail(' + persona + ') -> ' + file);
  await page.close();
  return path;
}

async function capture10(browser) {
  const { writeFileSync, readFileSync } = await import('node:fs');
  const dana = await captureRail(browser, 'dana', '_rail-dana.png');
  const marcus = await captureRail(browser, 'marcus', '_rail-marcus.png');
  const b64 = (f) => 'data:image/png;base64,' + readFileSync(f).toString('base64');

  // Composed in the browser rather than with an image library: no new dependency, and the labels
  // land in the same typeface the rails are rendered in.
  const html = [
    '<!doctype html><html><head><meta charset="utf-8"><style>',
    'body{margin:0;background:#0d0d0c;color:#fff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif}',
    '.wrap{display:flex;gap:20px;padding:22px}.col{flex:1;min-width:0}',
    '.who{font-size:19px;font-weight:700;margin:0 0 10px 2px}',
    '.who span{color:#8a8a80;font-weight:400;font-size:15px}',
    'img{width:100%;height:auto;display:block;border:1px solid #33332f;border-radius:10px}',
    '</style></head><body><div class="wrap">',
    '<div class="col"><p class="who">Dana <span>-- vintage collector</span></p><img src="' + b64(dana) + '"></div>',
    '<div class="col"><p class="who">Marcus <span>-- competitive player</span></p><img src="' + b64(marcus) + '"></div>',
    '</div></body></html>',
  ].join('');
  const tmp = OUT + '/_compose.html';
  writeFileSync(tmp, html);

  const page = await newPage(browser, 'guest');
  await page.setViewportSize({ width: 1900, height: 900 });
  const { pathToFileURL } = await import('node:url');
  await page.goto(pathToFileURL(tmp).href, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const path = OUT + '/10-rec-rails-two-personas.png';
  await page.locator('.wrap').screenshot({ path });
  console.log('#10 -> ' + path);
  await page.close();
}

const which = process.argv[2] ?? 'all';
const browser = await chromium.launch({ channel: 'msedge' });
try {
  if (which === '1' || which === 'all') await capture1(browser);
  if (which === '6' || which === 'all') await capture6(browser);
  if (which === '5' || which === 'all') await capture5(browser);
  if (which === '7' || which === 'all') await capture7(browser);
  if (which === '8' || which === 'all') await capture8(browser);
  if (which === '10' || which === 'all') await capture10(browser);
  if (which === '9' || which === 'all') await capture9(browser);
  if (which === '11' || which === 'all') await captureAdvisor(browser, 'dana', '11-advisor-dana.png');
  if (which === '12' || which === 'all') await captureAdvisor(browser, 'marcus', '12-advisor-marcus.png');
} finally {
  await browser.close();
}
