# Brand mark

`rabidlogo.png` (1254x1254, transparent PNG) is the master RabidMoose mark. It is
the only source of truth for the site avatar and every icon in `public/`; nothing
here is served to the browser.

## Derivatives

`node brand/generate-icons.mjs` writes all five, into `search-app/public/`:

| File | Size | Used by |
|---|---|---|
| `rabidmoose-icon.webp` | 256 | `SiteHeader`, `SiteFooter`, `HoloStudioOverlay` (sleeve back) |
| `favicon-32x32.png` | 32 | `index.html` |
| `favicon-16x16.png` | 16 | `index.html` |
| `favicon.ico` | 16/32/48 | `index.html` (`sizes="any"` fallback) |
| `apple-touch-icon.png` | 180 | `index.html` — opaque `#150e0a` tile, mark inset to 86% |

`sharp` is intentionally **not** a devDependency; this runs once per logo change
and its outputs are committed. To re-run:

```
cd search-app && npm i --no-save sharp && node brand/generate-icons.mjs
```

## The one rule: never mask this mark to a circle

The art is a circular badge whose **antlers overflow the circle** — ~5.5% of its
opaque pixels sit outside the inscribed circle, reaching a radius of 774px against
the circle's 585px. `overflow-hidden rounded-full` + `object-cover`, which the
header and footer carried for the previous mark, shears the antler tips off. Every
call site uses `object-contain` on an unclipped frame instead. The badge circle
still fills ~95% of the square, so nothing reads smaller for it.

The badge supplies its own rim, so call sites paint no background and add no ring —
either would double up on the rim.

## Also generated here

| File | Size | Used by |
|---|---|---|
| `rabidmoose-og.png` | 1200x630 | `index.html` og:image/twitter:image, and `DEFAULT_OG_IMAGE` in `src/lib/seo.ts` |
| `icon-192.png` / `icon-512.png` | 192 / 512 | `public/manifest.webmanifest` (`purpose: any maskable`) |

The social card rebuilds the `.wordmark` treatment from `src/index.css` in SVG,
and takes its palette from that file's tokens. If either changes, re-run the
script rather than editing the PNG.

## Where the mark appears in the app

Always through `src/components/MooseMark.tsx`, never a raw `<img>`:

- `SiteHeader` / `SiteFooter` — the logo lockup
- `ProfileSwitcher` — the Guest persona's avatar (see `public/personas/README.md`)
- `CardConsultant` / `ConsultantPanel` — the consultant's speaker avatar
- `GeminiConsultantAnswer` — the same badge, breathing, while an answer is in flight
- `NotFoundPage`, `CartPage` (empty), `EmptyStateRecommendations` — dead-end states
- `NewsArt` — a faint watermark on the last-resort category plate
- `HoloStudioOverlay` — the sleeve back

Plus `src/lib/confettiBurst.ts`, which uses a hand-authored SILHOUETTE of the
mark rather than the image — see the comment there for why, and for the winding
rule that keeps it from punching a hole through itself.
