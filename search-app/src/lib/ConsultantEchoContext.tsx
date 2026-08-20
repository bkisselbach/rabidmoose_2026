import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

// A one-way channel from the Consultant panel to whatever is rendered around it, carrying only the
// TCG energy types the current consultation has settled on.
//
// It exists so the home hero's flanking card scans can answer the consultation instead of ignoring
// it: with an empty draft they stay the Hub-configured trending slot (the merchandiser's pick, and
// the claim home-polish C1 shipped), and once a consultation resolves they become cards that
// actually answer it. "The hero's merchandising is the merchandiser's -- until you tell it what you
// need, and then it's yours."
//
// Deliberately a CONTEXT rather than props or lifted state, for one reason: CardConsultant must
// stay surface-agnostic. It is mounted in the hero, in the floating dock, and (later) anywhere
// else, and only one of those cares what it resolved to. Publishing into an optional context lets
// the hero listen without the panel knowing the hero exists -- and with no provider mounted, both
// the publish and the read are inert no-ops rather than an error.
//
// Carries the TCG vocabulary (`cardTypes`: Lightning, Colorless…) rather than the Pokédex one,
// because the consumer queries the CARD catalog, which is filed under the collapsed energy types.

interface ConsultantEcho {
  /** Settled TCG energy types for the current consultation; empty when there is nothing to echo. */
  cardTypes: string[];
  publish: (cardTypes: string[]) => void;
}

const ConsultantEchoContext = createContext<ConsultantEcho>({ cardTypes: [], publish: () => {} });

export function ConsultantEchoProvider({ children }: { children: ReactNode }) {
  const [cardTypes, setCardTypes] = useState<string[]>([]);

  // Compared by value, not identity: the panel republishes on every settle, and a fresh array with
  // the same contents would otherwise restart the consumer's fetch on every render.
  const publish = useCallback((next: string[]) => {
    setCardTypes((prev) => (prev.length === next.length && prev.every((t, i) => t === next[i]) ? prev : next));
  }, []);

  const value = useMemo(() => ({ cardTypes, publish }), [cardTypes, publish]);
  return <ConsultantEchoContext.Provider value={value}>{children}</ConsultantEchoContext.Provider>;
}

export function useConsultantEcho() {
  return useContext(ConsultantEchoContext);
}
