import { useEffect, useState } from 'react';
import { TypeIconCircles } from '@/components/pokedex/TypeIconCircles';
import { cn } from '@/lib/utils';

interface Props {
  /** pokemondb gallery, official artwork first; most species have exactly one image. */
  images: string[];
  name: string;
  types: string[];
  size: 'sm' | 'md';
  className?: string;
}

const ROTATE_MS = 4000;

/** Auto-rotates through the gallery (alternate forms) with no arrows/dots; pauses on hover/focus. */
export function PokedexPortrait({ images, name, types, size, className }: Props) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  // Reset on species change -- instance is reused across evolution-line navigation.
  useEffect(() => setIndex(0), [images.join('|')]);

  useEffect(() => {
    if (images.length <= 1 || paused) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % images.length), ROTATE_MS);
    return () => clearInterval(id);
  }, [images.length, paused]);

  const frame = size === 'sm' ? 'h-16 w-16' : 'h-28 w-28';
  const overlayOffset = size === 'sm' ? '-right-1.5 -top-1.5' : '-right-2 -top-2';
  const iconSize = size === 'sm' ? 'sm' : 'md';
  const current = images[index] ?? images[0];

  return (
    <div
      className={cn('relative flex shrink-0 items-center justify-center rounded-md bg-card/70 p-1.5 shadow-rest ring-1 ring-border', frame, className)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {current && (
        <img
          key={current}
          src={current}
          alt={name}
          className="fade-in-panel max-h-full max-w-full object-contain"
        />
      )}
      <TypeIconCircles types={types} size={iconSize} className={cn('absolute', overlayOffset)} />
    </div>
  );
}
