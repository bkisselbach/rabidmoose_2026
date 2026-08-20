import { Link } from 'react-router-dom';

// Links to the plain advisory search ("weak to X and Y") rather than a bespoke route so it
// re-enters the existing matchup advisor (queryIntent.ts resolves counters from the index).

interface Props {
  weaknesses: string[];
  className?: string;
}

/** Beyond three the advisor resolves to most of the type chart and stops narrowing anything. */
const MAX_TARGETS = 3;

export function CounterCardsLink({ weaknesses, className }: Props) {
  if (weaknesses.length === 0) return null;
  const query = `My deck is weak to ${weaknesses.slice(0, MAX_TARGETS).join(' and ')}`;

  return (
    <Link
      to={`/search?q=${encodeURIComponent(query)}`}
      className={className ?? 'tap-safe mt-2 inline-block text-xs font-semibold text-primary hover:underline'}
    >
      Shop cards that counter {weaknesses.length === 1 ? 'this' : 'these'} &rarr;
    </Link>
  );
}
