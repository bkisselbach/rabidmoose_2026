import { useEffect, useRef, useState } from 'react';

// A placeholder that types itself, cycling the kinds of thing the Consultant can actually answer.
//
// This is the one piece of decorative motion in the panel, and it earns its place by doing a job
// copy can't: an empty advisory box is genuinely hard to start with, because nobody knows what
// register to use ("charizard"? a sentence? a question?). Showing three real, working sentences
// being typed teaches the input's range faster than a label that says "try asking a question".
//
// Every phrase here must be one the parser genuinely handles -- a placeholder that demos a query
// the app can't answer is worse than no placeholder. These are all verified shapes: an advisory
// matchup, a matchup with a budget, and a rarity+type filter.
//
// Stops permanently once the user types (the caller passes `active: false`), and never runs under
// prefers-reduced-motion, where it renders the first phrase statically instead.

const TYPE_MS = 55;
const DELETE_MS = 28;
const HOLD_MS = 1800;

export function useTypewriter(phrases: string[], active: boolean): string {
  const [text, setText] = useState(phrases[0] ?? '');
  // A ref, not state: the timer chain reads these to decide the next step, and putting them in
  // state would restart the effect on every character.
  const step = useRef({ phrase: 0, chars: 0, deleting: false });

  useEffect(() => {
    if (!active || phrases.length === 0) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setText(phrases[0]);
      return;
    }

    let timer: number;
    const tick = () => {
      const s = step.current;
      const phrase = phrases[s.phrase % phrases.length];

      if (!s.deleting && s.chars < phrase.length) {
        s.chars += 1;
        setText(phrase.slice(0, s.chars));
        timer = window.setTimeout(tick, TYPE_MS);
      } else if (!s.deleting) {
        s.deleting = true;
        timer = window.setTimeout(tick, HOLD_MS);
      } else if (s.chars > 0) {
        s.chars -= 1;
        setText(phrase.slice(0, s.chars));
        timer = window.setTimeout(tick, DELETE_MS);
      } else {
        s.deleting = false;
        s.phrase += 1;
        timer = window.setTimeout(tick, TYPE_MS);
      }
    };

    timer = window.setTimeout(tick, TYPE_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the joined phrase list
  }, [active, phrases.join('|')]);

  return text;
}
