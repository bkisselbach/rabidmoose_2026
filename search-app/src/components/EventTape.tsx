import { useSyncExternalStore, useState } from 'react';
import { Activity, X, Trash2 } from 'lucide-react';
import { clearEvents, getEventTape, subscribeToEventTape, type TapedEvent } from '@/lib/eventTape';
import { cn } from '@/lib/utils';

// THE EVENT TAPE — the live analytics overlay. See lib/eventTape.ts for the honesty rules it is
// built on, and presentation/analytics-events-plan.md §3 Phase F for why it exists at all.
//
// In one line: every other Coveo capability in this app can be pointed at on screen, but the
// analytics that make relevance improve over time are invisible by construction. This makes them
// pointable, and labels each event with the model it trains.

function timeOf(at: number) {
  return new Date(at).toLocaleTimeString('en-US', { hour12: false, minute: '2-digit', second: '2-digit' });
}

function EventRow({ event }: { event: TapedEvent }) {
  return (
    <li className="fade-in-panel flex items-baseline gap-2 border-b border-border/60 py-1.5 last:border-0">
      <span className="shrink-0 font-mono text-2xs tabular-nums text-muted-foreground">{timeOf(event.at)}</span>
      <span
        className={cn(
          'shrink-0 rounded px-1 py-0.5 text-2xs font-bold uppercase',
          // The two protocols are colour-separated because the split is the substance: EP on the
          // commerce half, legacy UA on the three search engines.
          event.protocol === 'ep' ? 'bg-coveo/15 text-coveo' : 'bg-muted text-muted-foreground'
        )}
      >
        {event.protocol}
      </span>
      <span className="min-w-0 flex-1">
        <span className="font-mono text-2xs font-semibold text-foreground">{event.name}</span>
        {event.detail && <span className="ml-1.5 text-2xs text-muted-foreground">{event.detail}</span>}
        {/* `trains: null` renders as nothing rather than "—": a custom event genuinely trains no
            model, and padding the column would imply otherwise. */}
        {event.trains && <span className="mt-0.5 block text-2xs text-coveo">&rarr; trains {event.trains}</span>}
      </span>
    </li>
  );
}

export function EventTape() {
  const [open, setOpen] = useState(false);
  const events = useSyncExternalStore(subscribeToEventTape, getEventTape);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Show the Coveo analytics event tape"
        className="pressable fixed bottom-4 right-4 z-50 inline-flex items-center gap-1.5 rounded-full border border-coveo/30 bg-card/95 px-3 py-1.5 text-xs font-semibold text-coveo shadow-rest backdrop-blur"
      >
        <Activity className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Events
        {events.length > 0 && (
          <span className="rounded-full bg-coveo px-1.5 text-2xs font-bold tabular-nums text-coveo-foreground">
            {events.length}
          </span>
        )}
      </button>
    );
  }

  return (
    <aside className="rise-in fixed bottom-4 right-4 z-50 flex max-h-[70vh] w-[min(24rem,calc(100vw-2rem))] flex-col rounded-2xl border border-coveo/30 bg-card/98 shadow-rest backdrop-blur">
      <header className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Activity className="h-4 w-4 shrink-0 text-coveo" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-foreground">Coveo event tape</p>
          <p className="text-2xs text-muted-foreground">What this session has sent, and what it trains</p>
        </div>
        <button
          type="button"
          onClick={clearEvents}
          aria-label="Clear the tape"
          className="pressable rounded-full p-1 text-muted-foreground hover:text-foreground"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Hide the event tape"
          className="pressable rounded-full p-1 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-1">
        {events.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            Nothing yet. Search, open a card, add to cart — events land here as they&rsquo;re sent.
          </p>
        ) : (
          <ul>
            {events.map((event) => (
              <EventRow key={event.id} event={event} />
            ))}
          </ul>
        )}
      </div>

      {/* The restraint note. This is the part worth saying out loud: the app deliberately does not
          report everything it could, and that is a design decision rather than a gap. */}
      <footer className="border-t border-border px-3 py-2">
        <p className="text-2xs leading-relaxed text-muted-foreground">
          Decorative catalog reads send <span className="font-mono">capture: false</span> and never appear here.
          Recommendation impressions don&rsquo;t either &mdash; the Event Protocol has no impression event, and this
          app won&rsquo;t invent one.
        </p>
      </footer>
    </aside>
  );
}
