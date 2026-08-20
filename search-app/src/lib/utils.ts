import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Accent- and case-insensitive comparison key (Flabébé, Pokémon é) -- the shared normalization
 *  for every place this app matches user text against indexed vocabulary: typeahead ranking,
 *  fuzzy correction, and conversational query parsing. Lives here rather than next to any one of
 *  them so the pure parser (queryIntent.ts) doesn't have to import a module that fetches. */
export function normalizeForMatch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}
