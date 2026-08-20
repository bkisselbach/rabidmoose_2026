import { Popover } from 'radix-ui';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MooseMark } from '@/components/MooseMark';
import { PERSONAS, getActivePersona, switchPersona } from '@/lib/visitorId';
import { logCustomInteraction } from '@/lib/customEvents';

// Amazon-style account control, per personalization-plan.md's "DECIDED: header, account-style"
// section -- avatar, name, a menu to switch. The tension that section calls out (an account
// control implies logged-in; Coveo's personalization here is anonymous, clientId-keyed) is resolved
// in the popover copy below rather than left implicit.

/** Guest's fallback is the site's own mark, NOT a face and not the neutral `User` glyph it used to
 *  be. `public/personas/README.md` set the rule this has to satisfy -- "the anonymous visitor should
 *  not look like a person" -- and a moose satisfies it as completely as the glyph did, while
 *  actually looking like something. The mark reading as "the store, not a shopper" is fine and
 *  arguably right here: an un-switched visitor IS the house default, and the label "Guest" sits
 *  beside it in every placement, so there is no ambiguity about whose slot it occupies. */
function PersonaAvatar({ avatar, size = 'h-7 w-7' }: { avatar: string | null; size?: string }) {
  return avatar ? (
    <img src={avatar} alt="" className={cn(size, 'shrink-0 rounded-full object-cover')} />
  ) : (
    <MooseMark className={size} />
  );
}

export function ProfileSwitcher({ className }: { className?: string }) {
  const active = getActivePersona();

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        {/* Same chrome as the header's Cart button (CartDrawer.tsx's SheetTrigger) -- rounded-xl
            card surface with a border, not a bare hover-only pill, so the two icon-cluster
            controls read as one family rather than two different treatments. Explicit `h-9`
            (matching the Cart button and the header's other icon-cluster control, the settings
            gear) rather than matching padding values -- the avatar and the cart's bag icon are
            different sizes, so equal padding doesn't actually produce equal height; a fixed
            height does, regardless of what's inline inside. */}
        <button
          type="button"
          aria-label={`Switch shopper — currently ${active.name}`}
          title={active.name}
          className={cn(
            'pressable',
            'flex h-9 shrink-0 items-center gap-2 rounded-xl border border-border bg-card px-2.5 text-foreground transition-colors hover:border-primary/40 hover:bg-muted',
            className
          )}
        >
          <PersonaAvatar avatar={active.avatar} size="h-5 w-5" />
          <span className="hidden max-w-[8rem] truncate text-xs font-bold sm:inline">{active.name}</span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={10}
          className="popover-content z-30 w-72 rounded-md border border-border bg-card p-3"
        >
          <p className="px-1 pb-2 text-xs leading-snug text-muted-foreground">
            Fictional, pre-seeded demo visitors — not accounts. Switching reshapes real Coveo ML
            rails server-side (Recently Viewed, Cart, PDP Bought Together) around this visitor's own
            clientId — same anonymous mechanism a signed-out shopper gets for free, no login needed.
          </p>
          <div className="flex flex-col gap-0.5">
            {PERSONAS.map((persona) => (
              <Popover.Close asChild key={persona.key}>
                <button
                  type="button"
                  onClick={() => {
                    // Logged BEFORE the switch: `switchPersona` changes the clientId every
                    // subsequent event is attributed to, so reporting after it would file the
                    // switch under the persona being switched TO, losing who left.
                    logCustomInteraction('personaSwitch', { persona: persona.key });
                    switchPersona(persona.key);
                  }}
                  className={cn(
                    'pressable',
                    'flex items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted',
                    persona.key === active.key && 'bg-muted'
                  )}
                >
                  <PersonaAvatar avatar={persona.avatar} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">{persona.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{persona.subtitle}</span>
                  </span>
                  {persona.key === active.key && (
                    <Check className="h-4 w-4 shrink-0 text-accent-secondary" aria-hidden="true" />
                  )}
                </button>
              </Popover.Close>
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
