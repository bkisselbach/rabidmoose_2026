import { Link } from 'react-router-dom';
import {
  Facebook,
  Instagram,
  Mail,
  PackageCheck,
  ShieldCheck,
  Sparkles,
  Twitch,
  Twitter,
  Youtube,
} from 'lucide-react';
import { MooseMark } from '@/components/MooseMark';

// Three stacked bands, each on its own background, so the footer reads as a real marketplace
// footer rather than one hairline rule and two link stacks: a muted trust strip, the main link
// band on a near-black indigo, and a darker legal bar under it. The background change is what
// does the separating -- borders alone weren't enough to make the footer stop looking like the
// tail of the page content.
//
// Bands 2 and 3 are deliberately hardcoded dark (not `bg-foreground`/`--background`-derived) --
// under the light-canvas theme this footer originally shipped with, `bg-foreground` WAS dark and
// `text-background` WAS light, so reusing those tokens for an "inverted" dark band was a free
// trick. The RabidMoose dark-canvas rework flipped what both tokens mean (foreground is now
// near-white, background is now near-black), which silently inverted this footer along with it --
// caught visually, not by any type error, since the classes were still perfectly valid Tailwind.
// Hardcoded values here are pinned to "always dark," independent of whichever way `--foreground`/
// `--background` point.

// Most footer entries on a marketplace point at policy/company pages this proof of concept
// doesn't have. Those render as inert labels rather than links to nowhere: styled like the rest
// of the column and hover-lit, but they don't navigate, and they aren't focusable anchors
// promising a destination that isn't there. Anything with a real route stays a real <Link>.
function FooterLink({
  to,
  state,
  children,
}: {
  to?: string;
  /** Router state, for the routes that are driven by it rather than by the query string --
   *  `browseZone` and the facet presets SearchResultsPage reads on arrival. */
  state?: unknown;
  children: React.ReactNode;
}) {
  // Deliberately NOT `tap-safe`, though these are 24px tall. The column is `space-y-2`, so the row
  // pitch is 32px -- smaller than the 44px hit box the utility would apply, which means adjacent
  // links would get OVERLAPPING targets and the lower one (later in DOM order) would quietly steal
  // taps meant for the one above it. An ambiguous target is worse than a small one. A dense link
  // list at this pitch is the standard mobile footer pattern; leave it alone.
  const className = 'block text-foreground/70 transition-colors hover:text-foreground';
  return to ? (
    <Link to={to} state={state} className={className}>
      {children}
    </Link>
  ) : (
    <span className={`${className} cursor-default`}>{children}</span>
  );
}

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="eyebrow text-foreground">{title}</p>
      {children}
    </div>
  );
}

// Purely decorative -- no social presence exists for this fictional client, so these are inert
// like FooterLink's no-`to` links: styled and hover-lit, not focusable anchors to nowhere.
const SOCIAL_ICONS = [Twitter, Instagram, Facebook, Youtube, Twitch];

export function SiteFooter() {
  // The footer measured 1,282px at 375px on EVERY route -- 32% of the home page and 70% of the
  // 404 page, which was more footer than page. The cause was the link band staying one column all
  // the way to `lg`: five stacked blocks 40px apart. Two columns from `sm` (the standard
  // marketplace pattern) with a tighter gap below `lg` halves it, and nothing is removed.
  return (
    <footer className="mt-12 sm:mt-20">
      {/* Band 1 -- the trust strip, on the muted canvas. Three claims a card marketplace is
          actually judged on (condition, authenticity, pricing), stated once. */}
      <div className="border-y border-border bg-muted">
        <div className="page-container grid gap-4 py-6 sm:grid-cols-3">
          {[
            { icon: PackageCheck, title: 'Sleeved and toploaded', body: 'Every card ships protected, tracked, and insured over $50.' },
            { icon: ShieldCheck, title: 'Authenticity guaranteed', body: 'Graded slabs verified on intake; raw cards photographed as sent.' },
            { icon: Sparkles, title: 'Prices that move', body: 'Market values refresh against live sales, not a fixed list.' },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="flex items-start gap-3">
              <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div>
                <p className="text-sm font-semibold text-foreground">{title}</p>
                <p className="text-xs text-muted-foreground">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Band 2 -- the link band, always dark (see the file-top comment on why this is a
          hardcoded color, not `bg-foreground`). */}
      <div className="bg-scrim">
        {/* Two columns from the SMALLEST width, not from `sm`. A first pass used `sm:grid-cols-2`
            and moved the footer by 48px, because `sm` is 640px -- every phone stayed on the
            one-column path this was meant to fix. The four link columns are 4 short entries each
            and tile as a 2x2 at 375px with ~159px per column, which fits the longest of them
            ("Shipping & delivery"). */}
        <div className="page-container grid grid-cols-2 gap-x-6 gap-y-8 py-10 lg:grid-cols-[1.4fr_repeat(4,1fr)] lg:gap-10 lg:py-12">
          {/* Spans the full row below lg so the four link columns tile cleanly beneath it rather
              than leaving an orphan cell. */}
          <div className="col-span-2 max-w-sm lg:col-span-1">
            {/* Bold/dimensional wordmark -- matches SiteHeader's lockup exactly (same .wordmark*
                classes from index.css) instead of the older flat two-tone text this used to carry. */}
            <p className="flex items-center gap-2 uppercase">
              {/* Same bare frame as SiteHeader's lockup: the badge art supplies its own rim and is
                  transparent outside it, so neither the white fill nor the amber ring that used to
                  sit under/around it belongs here -- both only doubled up on the badge's own rim.
                  `MooseMark` (not an inline <img>) for the same reason the header uses it: the
                  mark's antlers overflow its circle, and that component owns the no-clip rule. */}
              <MooseMark className="h-6 w-6" />
              <span className="text-base">
                <span className="wordmark wordmark-rabid">Rabid</span><span className="wordmark wordmark-moose">Moose</span>
              </span>
            </p>
            {/* No live counts here (v2 rule: one number moment per page) -- the hero owns them. */}
            <p className="mt-3 text-sm text-foreground/70">
              Pok&eacute;dex facts and real, live-priced trading cards &mdash; all in one search box.
            </p>

            {/* Inert -- see the SOCIAL_ICONS comment. Round buttons on a hairline ring, the
                standard footer social cluster. */}
            <div className="mt-5 flex items-center gap-2">
              {SOCIAL_ICONS.map((Icon, i) => (
                <span
                  key={i}
                  className="flex h-8 w-8 cursor-default items-center justify-center rounded-full border border-foreground/15 text-foreground/60 transition-colors hover:border-foreground/30 hover:text-foreground"
                >
                  <Icon className="h-4 w-4" />
                </span>
              ))}
            </div>

            {/* Inert email capture -- no backend to send it to, styling only. */}
            <div className="mt-5 flex max-w-xs items-center gap-2 rounded-full border border-foreground/15 py-1 pl-3 pr-1">
              <Mail className="h-4 w-4 shrink-0 text-foreground/40" aria-hidden="true" />
              <span className="flex-1 truncate text-xs text-foreground/40">Get restock alerts</span>
              <span className="cursor-default whitespace-nowrap rounded-full bg-accent-secondary px-3 py-1.5 text-xs font-semibold text-scrim">
                Sign up
              </span>
            </div>
          </div>

          <FooterColumn title="Shop">
            <FooterLink to="/search" state={{ browseZone: 'marketplace' }}>
              All cards
            </FooterLink>
            <FooterLink to="/search?q=charizard">Charizard</FooterLink>
            <FooterLink to="/search?q=holo+rare">Holo rares</FooterLink>
            <FooterLink to="/search?q=base+set">Base Set</FooterLink>
          </FooterColumn>

          <FooterColumn title="Pokédex">
            {/* A real path now (pokedex-vault-plan.md Phase 1), so this one needs no router state --
                it was the only Pokédex-column entry that depended on it. The Shop column's "All
                cards" still carries `browseZone` because /search is untouched this round (D5). */}
            <FooterLink to="/pokedex">All Pok&eacute;mon</FooterLink>
            <FooterLink to="/search?q=How+does+Bulbasaur+evolve%3F">Ask the Pok&eacute;dex</FooterLink>
            <FooterLink to="/search?q=I+need+to+defeat+Rock+types">Type matchups</FooterLink>
            <FooterLink to="/pokedex/charizard">Charizard</FooterLink>
          </FooterColumn>

          <FooterColumn title="Support">
            <FooterLink>Shipping &amp; delivery</FooterLink>
            <FooterLink>Returns</FooterLink>
            <FooterLink>Grading guide</FooterLink>
            <FooterLink>Contact us</FooterLink>
          </FooterColumn>

          <FooterColumn title="Company">
            <FooterLink>About RabidMoose</FooterLink>
            <FooterLink>Sell with us</FooterLink>
            <FooterLink>Careers</FooterLink>
            <FooterLink>Press</FooterLink>
          </FooterColumn>
        </div>
      </div>

      {/* Band 3 -- the legal bar, a step darker again. The engagement frame lives here, stated
          quietly: this app is an FDE-built pre-sales artifact for a fictional client, now
          branded RabidMoose (see presentation/rabidmoose-rebrand-plan.md). Only "Coveo" carries
          color. */}
      <div className="bg-scrim-deep">
        <div className="page-container flex flex-col gap-3 py-4 text-xs text-foreground/50">
          {/* Inert payment-brand badges -- text stand-ins, not real logos, so nothing here claims
              an integration this PoC doesn't have. */}
          <div className="flex flex-wrap items-center gap-2 border-b border-foreground/10 pb-3">
            {['Visa', 'Mastercard', 'Amex', 'PayPal', 'Apple Pay', 'Google Pay'].map((brand) => (
              <span
                key={brand}
                className="cursor-default rounded border border-foreground/15 px-2 py-1 font-semibold tracking-tight text-foreground/40"
              >
                {brand}
              </span>
            ))}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p>
              Proof of concept &middot; Prepared for RabidMoose &middot; Powered by{' '}
              <span className="font-semibold text-coveo">Coveo</span>
            </p>
            <p className="flex flex-wrap gap-x-4 gap-y-1">
              <span>&copy; {new Date().getFullYear()} RabidMoose</span>
              <span className="cursor-default transition-colors hover:text-foreground">Terms</span>
              <span className="cursor-default transition-colors hover:text-foreground">Privacy</span>
              <span className="cursor-default transition-colors hover:text-foreground">Cookies</span>
              <span className="cursor-default transition-colors hover:text-foreground">
                Accessibility
              </span>
              <span className="cursor-default transition-colors hover:text-foreground">Sitemap</span>
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
