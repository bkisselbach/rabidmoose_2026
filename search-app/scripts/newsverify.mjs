// Live verification for /pokemon-news and /pokemon-news/:slug.
// Run with the dev server up: node scripts/newsverify.mjs
import { chromium } from 'playwright-core';

const BASE = 'http://localhost:5173';
const OUT = process.env.OUT || '.';
const errors = [];
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' -- ' + detail : ''}`);
  if (!ok) failures++;
};

const browser = await chromium.launch({ channel: 'msedge' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await ctx.newPage();
page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 120)));

const cards = () => page.locator('[data-testid="news-card"]');

console.log('\n=== /pokemon-news ===');
await page.goto(`${BASE}/pokemon-news`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-testid="news-card"]', { timeout: 20000 });
const n = await cards().count();
check('article cards render', n > 0, `${n} cards`);
const summary = ((await page.locator('[data-testid="news-summary"]').textContent()) || '').trim();
check('summary shows a real count', /15/.test(summary), summary);
const facetLabels = await page.locator('[data-testid="facet"]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
check('all five facets render', facetLabels.length === 5, facetLabels.join(', '));

// Newest-first ordering is the whole point of a newsroom; assert it rather than assume it.
console.log('\n=== default sort is newest-first ===');
const dates = await cards().evaluateAll((els) =>
  els.map((e) => {
    const m = e.textContent.match(/([A-Z][a-z]+ \d{1,2}, \d{4})/);
    return m ? Date.parse(m[1]) : null;
  })
);
const usable = dates.filter((d) => d !== null);
const descending = usable.every((d, i) => i === 0 || usable[i - 1] >= d);
check('rendered order is newest-first', usable.length > 2 && descending, `${usable.length} dated cards, first=${new Date(usable[0]).toISOString().slice(0, 10)} last=${new Date(usable.at(-1)).toISOString().slice(0, 10)}`);

console.log('\n=== facet -> URL round-trip ===');
const chip = page.locator('[data-testid="facet"][data-facet-id="newscategory"] button[aria-pressed]').first();
const chipText = ((await chip.textContent()) || '').trim();
await chip.click();
await page.waitForTimeout(2000);
check('f-newscategory in URL', new URL(page.url()).searchParams.has('f-newscategory'), decodeURIComponent(new URL(page.url()).search));
const filtered = await cards().count();
check('results narrowed', filtered > 0 && filtered < n, `${n} -> ${filtered} (${chipText})`);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-testid="news-card"]', { timeout: 20000 });
check('survives reload', (await cards().count()) === filtered, `${filtered}`);

console.log('\n=== search ===');
await page.goto(`${BASE}/pokemon-news?q=pikachu`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
const pikachu = await cards().count();
check('query actually filters', pikachu === 4, `${pikachu} results for "pikachu" (API ground truth: 4)`);

console.log('\n=== article page ===');
await page.goto(`${BASE}/pokemon-news`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-testid="news-card"]');
await cards().first().click();
await page.waitForURL(/\/pokemon-news\/.+/, { timeout: 10000 });
await page.waitForTimeout(4000);
check('headline renders', (((await page.locator('h1').first().textContent()) || '').trim()).length > 0);
check('body renders', (await page.locator('main p').count()) > 2, `${await page.locator('main p').count()} paragraphs`);
check('source credited', (await page.locator('a[href*="pokemon.com/us/news"]').count()) > 0);
const cardRail = await page.locator('[data-testid="product-card"], a[href^="/card/"]').count();
check('cards-in-this-story rail renders', cardRail > 0, `${cardRail} product links`);
await page.screenshot({ path: `${OUT}/news-article-1440.png`, fullPage: true });

console.log('\n=== bogus slug ===');
await page.goto(`${BASE}/pokemon-news/nope-not-real`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
check('not-found state', /not found/i.test((await page.locator('main').textContent()) || ''));
check('noindex', ((await page.locator('meta[name="robots"]').getAttribute('content')) || '').includes('noindex'));

console.log('\n=== mobile 375 ===');
await page.setViewportSize({ width: 375, height: 800 });
await page.goto(`${BASE}/pokemon-news`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-testid="news-card"]');
await page.waitForTimeout(1500);
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check('no horizontal overflow', overflow <= 0, `${overflow}px`);
await page.screenshot({ path: `${OUT}/news-index-375.png`, fullPage: true });
await page.setViewportSize({ width: 1440, height: 1000 });
await page.goto(`${BASE}/pokemon-news`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-testid="news-card"]');
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/news-index-1440.png`, fullPage: true });

console.log('\n=== console errors ===');
[...new Set(errors)].forEach((e) => console.log('  ', e));

console.log(`\n${failures === 0 ? 'ALL LIVE CHECKS PASSED' : failures + ' CHECK(S) FAILED'}\n`);
await browser.close();
process.exit(failures === 0 ? 0 : 1);
