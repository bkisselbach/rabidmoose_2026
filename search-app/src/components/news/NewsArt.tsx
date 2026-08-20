import { useEffect, useState } from 'react';
import { Newspaper, Gamepad2, Trophy, Clapperboard, ShoppingBag, Layers } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { subscribeToCharacter } from '@/lib/characterQueue';
import { useSetArt } from '@/lib/setArt';
import { MooseMark } from '@/components/MooseMark';
import { cn } from '@/lib/utils';
import type { NewsRecord } from '@/lib/newsRecord';

// Never hotlink pokemon.com images -- their CDN can break without warning. Hero images are
// self-hosted instead: downloaded once by news-scraper/src/download-images.ts into
// search-app/public/news/ and served from this app's own origin.
//
// Resolution order, first hit wins:
//   1. the story's first species  -> its Pokédex sprite (cached, queued lookup)
//   2. the story's card set       -> that set's TCGdex wordmark
//   3. the story's own hero image -> self-hosted /news/<slug>.<ext>
//   4. none of the above          -> the category's own icon over a faint RabidMoose watermark,
//                                    on a tinted plate (last resort only)
// Step 3 falling over at RUNTIME (the file is named but 404s) drops to step 4 as well, via the
// img's own onError -- see the note on that branch.

/** Category accents -- deliberately not the Pokémon type palette (typeColors.ts); these are
 *  editorial sections, not energy types.
 *
 *  EVERY entry names a palette token (2026-08-18, CSS/theming audit). Three of the six sat on raw
 *  Tailwind classes -- `amber-500`, `sky-500`, `emerald-500` -- which were the last
 *  Tailwind-palette colours anywhere in the app, so one map mixed two colour systems and the
 *  newsroom carried three hues that appear on no other page. The site's palette has exactly two
 *  accents (`--coveo` blue is reserved for provenance chips, `--destructive` means an error), so
 *  the six categories map onto amber / violet / neutral by kind: commerce-adjacent sections take
 *  amber, media and events take violet, the catch-all stays neutral. What separates the six is the
 *  ICON, which was already unique per category and does the identifying work; the tint is a family
 *  marker, not a per-category code. */
const CATEGORY_STYLE: Record<string, { icon: LucideIcon; tint: string; fg: string }> = {
  'Trading Card Game': { icon: Layers, tint: 'bg-primary/10', fg: 'text-primary' },
  Merchandise: { icon: ShoppingBag, tint: 'bg-primary/10', fg: 'text-primary' },
  'Video Games & Apps': { icon: Gamepad2, tint: 'bg-accent-secondary/10', fg: 'text-accent-secondary' },
  Animation: { icon: Clapperboard, tint: 'bg-accent-secondary/10', fg: 'text-accent-secondary' },
  'Play! Pokémon Events': { icon: Trophy, tint: 'bg-accent-secondary/10', fg: 'text-accent-secondary' },
  General: { icon: Newspaper, tint: 'bg-muted', fg: 'text-muted-foreground' },
};

export function categoryStyle(category: string) {
  return CATEGORY_STYLE[category] ?? CATEGORY_STYLE.General;
}

export function NewsArt({
  record,
  className,
}: {
  record: NewsRecord;
  /** The caller owns the box; this fills it. */
  className?: string;
}) {
  const species = record.species[0] ?? '';
  const [sprite, setSprite] = useState<string | null>(null);
  useEffect(() => {
    if (!species) return;
    return subscribeToCharacter(species, (rec) => setSprite(rec?.image ?? null));
  }, [species]);

  // Reset per record: this component is remounted by key in some rails but reused in others, and
  // a sticky true would suppress a perfectly good hero on the next article rendered here.
  const [heroFailed, setHeroFailed] = useState(false);
  useEffect(() => setHeroFailed(false), [record.heroImage]);

  const setArt = useSetArt();
  const setLogo = record.setName ? setArt.get(record.setName.toLowerCase()) : undefined;
  const { icon: Icon, tint, fg } = categoryStyle(record.category);

  // White plate, not tinted: sprite art mixes transparent PNGs with art already matted on white,
  // and a tint makes the matted ones show a hard white rectangle.
  if (sprite) {
    return (
      <span className={cn('flex items-center justify-center overflow-hidden bg-white', className)}>
        <img src={sprite} alt="" loading="lazy" className="max-h-[82%] max-w-[82%] object-contain" />
      </span>
    );
  }

  if (setLogo?.logo || setLogo?.symbol) {
    return (
      <span className={cn('flex items-center justify-center overflow-hidden bg-white p-4', className)}>
        <img src={setLogo.logo ?? setLogo.symbol} alt="" loading="lazy" className="max-h-full max-w-full object-contain" />
      </span>
    );
  }

  // `heroFailed` is the case the four-step chain above never covered: a self-hosted hero that is
  // present in the record but does not actually load (the download step missed it, the file was
  // pruned, the path drifted). Before this, that rendered the browser's broken-image glyph inside
  // an otherwise finished card -- the one failure mode that looks like a bug rather than a
  // fallback. `onError` demotes it to the branded plate below instead. Not a fifth resolution step:
  // it re-enters the same last-resort branch the chain already ends in.
  if (record.heroImage && !heroFailed) {
    return (
      <span className={cn('flex items-center justify-center overflow-hidden bg-muted', className)}>
        <img
          src={record.heroImage}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover"
          onError={() => setHeroFailed(true)}
        />
      </span>
    );
  }

  // The category icon stays the FOREGROUND and stays sized as it was: per the CATEGORY_STYLE note
  // above, the icon is what separates the six sections, and the tint is only a family marker. The
  // mark goes behind it as a watermark -- faint enough (opacity-10) that it never competes with the
  // glyph at thumbnail size, present enough that the last-resort plate reads as this site's empty
  // state rather than a generic tinted box. Both layers are decorative; the wrapper is aria-hidden.
  return (
    <span
      className={cn('relative flex items-center justify-center overflow-hidden', tint, className)}
      aria-hidden
    >
      <MooseMark className="absolute inset-0 h-full w-full scale-[0.78] opacity-10" />
      <Icon className={cn('relative h-1/3 w-1/3 opacity-70', fg)} />
    </span>
  );
}
