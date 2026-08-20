import { useState } from 'react';
import { Megaphone, X } from 'lucide-react';
import { notifyTrigger } from '@/notifyTrigger';
import { CoveoChip } from '@/components/CoveoChip';
import { useCoveoState } from '@/lib/useCoveoState';

export function NotifyBanner() {
  const state = useCoveoState(notifyTrigger);

  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const messages = state.notifications.filter((message) => !dismissed.has(message));
  if (messages.length === 0) return null;

  return (
    <div className="mb-6 space-y-2" data-testid="notify-banner">
      {messages.map((message) => (
        // Slim promo-bar proportions rather than a card: a tinted strip with a hairline rule, one
        // icon, and the dismiss affordance kept quiet at the end.
        <div
          key={message}
          className="flex items-center gap-3 rounded-md border border-primary/20 bg-primary/[0.07] px-4 py-2 text-sm text-foreground"
        >
          <Megaphone className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="flex-1 font-medium">{message}</span>
          <CoveoChip capability="notify-trigger" />
          <button
            type="button"
            aria-label="Dismiss"
            className="pressable -mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground"
            onClick={() => setDismissed((prev) => new Set(prev).add(message))}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
