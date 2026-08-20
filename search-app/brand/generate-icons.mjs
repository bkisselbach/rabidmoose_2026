/**
 * Regenerates every derivative of the RabidMoose brand mark from `rabidlogo.png`.
 *
 * `sharp` is deliberately NOT a devDependency -- this runs once per logo change,
 * and its outputs are committed. To re-run:
 *
 *     cd search-app && npm i --no-save sharp && node brand/generate-icons.mjs
 *
 * The master art is a circular badge whose antlers overflow the circle (~5.5% of
 * the opaque pixels sit outside the inscribed circle). Everything below therefore
 * squares the art on its own content bounding box and never applies a circular
 * mask -- the call sites use `object-contain` on an unclipped frame for the same
 * reason. Mask it and you decapitate the antlers.
 */
import { Buffer } from 'node:buffer';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(here, 'rabidlogo.png');
const OUT = path.join(here, '..', 'public');

/** iOS composites the touch icon on an opaque tile, so it needs a real backdrop.
 *  Deeper than the badge interior (#21130e) so the tan rim still separates. */
const TOUCH_BG = { r: 0x15, g: 0x0e, b: 0x0a, alpha: 1 };

/** Trim to the opaque bounding box, then pad back out to a centered square. */
async function squareMark() {
  const trimmed = await sharp(SRC).trim({ threshold: 1 }).toBuffer();
  const { width, height } = await sharp(trimmed).metadata();
  const side = Math.max(width, height);
  const x = Math.round((side - width) / 2);
  const y = Math.round((side - height) / 2);
  return sharp(trimmed)
    .extend({
      top: y,
      bottom: side - height - y,
      left: x,
      right: side - width - x,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
}

/** ICO container around already-encoded PNG frames (Vista+ reads PNG payloads). */
function ico(frames) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(frames.length, 4);

  let offset = 6 + frames.length * 16;
  const dir = frames.map(({ size, data }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2); // palette size
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });

  return Buffer.concat([header, ...dir, ...frames.map((f) => f.data)]);
}

const square = await squareMark();
const at = (size, opts) => sharp(square).resize(size, size, { kernel: 'lanczos3', ...opts });

await mkdir(OUT, { recursive: true });

// Site avatar: header, footer, Holo Studio sleeve. Transparent, antlers intact.
await at(256).webp({ quality: 92, effort: 6 }).toFile(path.join(OUT, 'rabidmoose-icon.webp'));

// Browser tabs.
const pngFrames = await Promise.all(
  [16, 32, 48].map(async (size) => ({ size, data: await at(size).png({ compressionLevel: 9 }).toBuffer() })),
);
for (const { size, data } of pngFrames) {
  if (size !== 48) await writeFile(path.join(OUT, `favicon-${size}x${size}.png`), data);
}
await writeFile(path.join(OUT, 'favicon.ico'), ico(pngFrames));

// iOS home screen: opaque tile, mark inset so the antlers clear the corner rounding.
const inset = Math.round(180 * 0.86);
await sharp({ create: { width: 180, height: 180, channels: 4, background: TOUCH_BG } })
  .composite([{ input: await at(inset).png().toBuffer(), gravity: 'centre' }])
  .png({ compressionLevel: 9 })
  .toFile(path.join(OUT, 'apple-touch-icon.png'));

console.log('wrote rabidmoose-icon.webp, favicon-16x16.png, favicon-32x32.png, favicon.ico, apple-touch-icon.png');

// ---------------------------------------------------------------------------
// Surfaces that are not "an icon at size N": the social card and the two PWA
// icons. Kept in this file rather than a second script so there is still one
// command to run after the logo changes.
// ---------------------------------------------------------------------------

/** Palette, resolved from the tokens in `src/index.css` rather than eyeballed, so the card can't
 *  drift away from the site it advertises: --background 229 84% 5%, --foreground 210 40% 98%,
 *  muted text 215 20% 65%. The two wordmark colours and their bevel shadows are the literal hex
 *  values in `.wordmark-rabid` / `.wordmark-moose`. */
const IMG = {
  bg: '#020617',
  fg: '#f8fafc',
  muted: '#94a3b8',
  rabid: '#FBBF24',
  rabidShadow: '#92400e',
  moose: '#C084FC',
  mooseShadow: '#6b21a8',
  bevel: '#1a1030',
};

/** The `.wordmark` treatment (index.css) rebuilt in SVG. CSS text-shadow has no SVG equivalent, so
 *  the two-step bevel is drawn as three stacked copies of the same string -- outermost shadow
 *  first -- and the -8deg skew rides a wrapping <g> because SVG text has no `transform: skewX`
 *  shorthand of its own. */
function wordmark(x, y, size) {
  const word = (text, dx, fill, shadow) => `
    <text x="${dx + 2}" y="2" font-size="${size}" font-family="Arial Black, Segoe UI Black, Impact, sans-serif" fill="${IMG.bevel}">${text}</text>
    <text x="${dx + 1}" y="1" font-size="${size}" font-family="Arial Black, Segoe UI Black, Impact, sans-serif" fill="${shadow}">${text}</text>
    <text x="${dx}" y="0" font-size="${size}" font-family="Arial Black, Segoe UI Black, Impact, sans-serif" fill="${fill}">${text}</text>`;
  // "RABID" is measured, not guessed at: Arial Black's advance width runs ~0.72em per uppercase
  // character, so five characters puts "MOOSE" at 3.6em. A wrong offset here shows up as a gap or
  // an overlap in the middle of the logotype, which is the one place it would be noticed.
  return `<g transform="translate(${x},${y}) skewX(-8)">${word('RABID', 0, IMG.rabid, IMG.rabidShadow)}${word('MOOSE', size * 3.6, IMG.moose, IMG.mooseShadow)}</g>`;
}

/** 1200x630 link preview. Replaces `rabidmoose-mascot.webp`, which index.html pointed both og:image
 *  and twitter:image at -- that file is a full-bleed illustration with no wordmark, so a shared
 *  link showed art that never said whose site it was. */
const OG_W = 1200;
const OG_H = 630;
const ogSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_W}" height="${OG_H}">
  <defs>
    <radialGradient id="glow" cx="26%" cy="42%" r="46%">
      <stop offset="0%" stop-color="${IMG.rabid}" stop-opacity="0.20"/>
      <stop offset="100%" stop-color="${IMG.rabid}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${OG_W}" height="${OG_H}" fill="${IMG.bg}"/>
  <rect width="${OG_W}" height="${OG_H}" fill="url(#glow)"/>
  ${wordmark(470, 316, 76)}
  <text x="470" y="376" font-size="30" font-family="Segoe UI, Helvetica, Arial, sans-serif" fill="${IMG.fg}">Pok&#233;mon Card Marketplace &amp; Pok&#233;dex</text>
  <text x="470" y="420" font-size="24" font-family="Segoe UI, Helvetica, Arial, sans-serif" fill="${IMG.muted}">Live-priced cards and collector knowledge in one search box.</text>
  <text x="470" y="492" font-size="20" font-family="Segoe UI, Helvetica, Arial, sans-serif" fill="${IMG.muted}" opacity="0.75">A Coveo proof of concept</text>
  <rect x="${OG_W - 6}" y="0" width="6" height="${OG_H}" fill="${IMG.rabid}" opacity="0.55"/>
</svg>`;

await sharp(Buffer.from(ogSvg))
  .composite([{ input: await at(300).png().toBuffer(), top: 178, left: 110 }])
  .png({ compressionLevel: 9 })
  .toFile(path.join(OUT, 'rabidmoose-og.png'));

// PWA install icons. `maskable` in the manifest means the launcher may crop to its own shape, so
// these are the ONLY derivatives that get deliberate padding -- 72% of the tile, inside Android's
// 80%-diameter safe zone, which is exactly the antler margin a circular mask would otherwise eat.
for (const size of [192, 512]) {
  await sharp({ create: { width: size, height: size, channels: 4, background: TOUCH_BG } })
    .composite([{ input: await at(Math.round(size * 0.72)).png().toBuffer(), gravity: 'centre' }])
    .png({ compressionLevel: 9 })
    .toFile(path.join(OUT, `icon-${size}.png`));
}

console.log('wrote rabidmoose-og.png, icon-192.png, icon-512.png');
