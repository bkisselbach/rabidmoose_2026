// Sending one Consultant turn, extracted out of GeminiConsultantAnswer.tsx so that the component
// which OWNS the transcript and the component which owns the COMPOSER are no longer the same one.
//
// They used to be: the follow-up input lived at the bottom of GeminiConsultantAnswer, and the
// page's search box lived in ConsultantPanel's header, which is how /search ended up with two
// text inputs in one card doing two different things. Merging them into a single mode-aware
// composer in the panel footer means the panel has to be able to send a turn -- and the panel is
// GeminiConsultantAnswer's PARENT, so the state cannot be lifted the usual way without hoisting
// the whole thread through SearchResultsPage.
//
// Same plain-module-with-subscribe shape as consultantThread.ts (which already holds the turns
// themselves) and consultationBrief.ts, for the same stated reason: readers on unrelated parts of
// the tree with no provider between them.

import { useSyncExternalStore } from 'react';
import { askConsultantDetailed, type ConsultFailure, type PersonaContext } from '@/lib/consultantChat';
import { appendTurn, getThread } from '@/lib/consultantThread';

let inFlight = false;
let lastFailure: ConsultFailure | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** True while a turn is awaiting its reply. Drives the transcript's typing indicator and the
 *  composer's disabled state -- one flag for both, which is why it lives here rather than as
 *  local state in either. */
export function useTurnInFlight(): boolean {
  return useSyncExternalStore(subscribe, () => inFlight, () => false);
}

/** The last turn's failure kind, or null if it succeeded (or none has been sent).
 *
 *  Deliberately NOT stored as a turn in `consultantThread`. The thread's turns are replayed to
 *  Gemini as conversation history on every later message, so an error notice living there would be
 *  fed back to the model as something the consultant said. This is UI state about the transport,
 *  not part of the conversation, and it is kept where it cannot leak into one. */
export function useTurnFailure(): ConsultFailure | null {
  return useSyncExternalStore(subscribe, () => lastFailure, () => null);
}

/** Appends the shopper's message, asks Gemini, appends the reply. Re-entrancy is guarded here
 *  rather than at each call site -- turn 1 fires from an effect and every later turn from the
 *  composer, and both can race a fast second trigger.
 *
 *  **A failed turn used to leave the shopper's message standing with no reply at all** -- no error
 *  bubble, matching how ContentGeneratedAnswer and AskPokedex self-hide rather than invent content.
 *  That rule is kept for those surfaces and **deliberately reversed here on 2026-08-19**. They are
 *  passive panels a visitor never addressed; this is a conversation the visitor just spoke into,
 *  and silence after your own message reads as a broken app rather than as an absent feature.
 *  `presentation/demo-relevancy-testbook.md` §8.1 put it as the difference between "the AI is
 *  thinking" and "the demo is broken". The honesty rule that actually matters is unbroken: the
 *  notice states that no answer came back, and never fabricates one.
 *
 *  No-ops unless `resetForQuery` has already anchored a thread -- `appendTurn` requires a turn-1
 *  anchor to append to, so sending into a null thread would silently drop the message. */
export async function sendConsultantTurn(text: string, personaContext?: PersonaContext): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed || inFlight || !getThread()) return;
  inFlight = true;
  // Cleared on send, not only on success: a retry that fails again must re-show the notice, and a
  // stale one hanging over an in-flight turn would contradict the typing indicator beside it.
  lastFailure = null;
  emit();
  // Captured BEFORE appending the new user turn, and read through the synchronous getter rather
  // than any React-render copy -- a stale closure here would re-send the model a history that is
  // missing the turn a fast-following second call already added.
  const priorTurns = (getThread()?.turns ?? []).map((t) => ({ role: t.role, text: t.text }));
  appendTurn({ role: 'user', text: trimmed });
  const { result, failure } = await askConsultantDetailed(trimmed, personaContext, undefined, priorTurns);
  inFlight = false;
  // 'aborted' is the caller superseding its own request, not an outage -- it stays silent.
  lastFailure = failure && failure !== 'aborted' ? failure : null;
  emit();
  if (result) {
    appendTurn({ role: 'model', text: result.text, productIds: result.productIds, speciesNames: result.speciesNames });
  }
}
