import { useEffect, useState } from 'react';

export type ViewMode = 'grid' | 'list';

const STORAGE_KEY = 'pokemon-tcg-view-mode';

function loadViewMode(): ViewMode {
  if (typeof window === 'undefined') return 'grid';
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === 'list' ? 'list' : 'grid';
  } catch {
    return 'grid';
  }
}

export function useViewMode(): [ViewMode, (mode: ViewMode) => void] {
  const [viewMode, setViewMode] = useState<ViewMode>(loadViewMode);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, viewMode);
    } catch {
      // localStorage may be unavailable (private browsing, quota exceeded) -- view mode still works in-memory.
    }
  }, [viewMode]);

  return [viewMode, setViewMode];
}
