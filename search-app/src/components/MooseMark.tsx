import { cn } from '@/lib/utils';

// The RabidMoose badge, everywhere it appears. One component rather than the raw <img> that used
// to be pasted into SiteHeader/SiteFooter/HoloStudioOverlay, because this mark has a rule that is
// easy to get wrong and invisible until you look closely:
//
//   NEVER MASK IT TO A CIRCLE.
//
// The art (`brand/rabidlogo.png`) is a circular badge whose ANTLERS OVERFLOW THAT CIRCLE -- ~5.5%
// of its opaque pixels sit outside the inscribed circle, reaching a radius of 774px against the
// circle's 585px. The `overflow-hidden rounded-full` + `object-cover` frames all three original
// call sites carried were written for the previous mark (a neon line drawing that genuinely was
// circular) and sheared the antler tips clean off. `object-contain` on an unclipped frame keeps
// the silhouette; the badge circle still fills ~95% of the square, so nothing reads smaller for it.
//
// The badge also supplies its OWN rim, so no caller paints a background or adds a ring -- either
// only doubles up on the rim the art already has. See `brand/README.md`.
export function MooseMark({
  className,
  breathing,
  title,
}: {
  /** The caller owns the box (`h-9 w-9`); this fills it. */
  className?: string;
  /** Slow "thinking" pulse for in-flight surfaces. See `.moose-breathing` in index.css. */
  breathing?: boolean;
  /** Only pass this where the mark carries meaning of its own (a speaker avatar). Left off, the
   *  mark is decorative and hidden from assistive tech, which is right for a logo sitting next to
   *  a wordmark that already says the same thing. */
  title?: string;
}) {
  return (
    <span
      className={cn('inline-flex shrink-0', breathing && 'moose-breathing', className)}
      aria-hidden={title ? undefined : 'true'}
      role={title ? 'img' : undefined}
      aria-label={title}
    >
      <img src="/rabidmoose-icon.webp" alt="" className="h-full w-full object-contain" />
    </span>
  );
}
