import { useCallback, useRef, useSyncExternalStore } from 'react';

/** Structural shape every Coveo Headless controller satisfies -- generic and commerce alike. */
interface CoveoController<T> {
  state: T;
  subscribe(listener: () => void): () => void;
}

/**
 * Replaces the `useState(controller.state)` + `useEffect(() => controller.subscribe(...), [])`
 * pair repeated across ~50 call sites.
 *
 * Headless's `.state` getter builds a fresh object on every access rather than caching one, so a
 * naive `getSnapshot() { return controller.state }` returns a new reference on every call --
 * useSyncExternalStore compares consecutive snapshots with Object.is, sees a "change" on its own
 * verification re-read with nothing actually different, and trips React's infinite-update-depth
 * guard (confirmed live: every migrated page threw "Maximum update depth exceeded" until this
 * cache was added). The ref below pins one snapshot per subscribe-notified change and hands back
 * that same reference until the next notification, which is what makes the identity check work.
 */
export function useCoveoState<T>(controller: CoveoController<T>): T {
  const cache = useRef<{ controller: CoveoController<T>; value: T } | undefined>(undefined);
  const subscribe = useCallback(
    (onStoreChange: () => void) =>
      controller.subscribe(() => {
        cache.current = { controller, value: controller.state };
        onStoreChange();
      }),
    [controller]
  );
  const getSnapshot = useCallback(() => {
    if (cache.current === undefined || cache.current.controller !== controller) {
      cache.current = { controller, value: controller.state };
    }
    return cache.current.value;
  }, [controller]);
  return useSyncExternalStore(subscribe, getSnapshot);
}

/** Same as {@link useCoveoState}, for controllers built conditionally (e.g. only once a slot id or
 *  recommendations config is known) and possibly `undefined` for the component's whole lifetime. */
export function useOptionalCoveoState<T>(controller: CoveoController<T> | undefined): T | undefined {
  const cache = useRef<{ controller: CoveoController<T> | undefined; value: T | undefined } | undefined>(undefined);
  const subscribe = useCallback(
    (onStoreChange: () => void) =>
      controller
        ? controller.subscribe(() => {
            cache.current = { controller, value: controller.state };
            onStoreChange();
          })
        : () => {},
    [controller]
  );
  const getSnapshot = useCallback(() => {
    if (cache.current === undefined || cache.current.controller !== controller) {
      cache.current = { controller, value: controller?.state };
    }
    return cache.current.value;
  }, [controller]);
  return useSyncExternalStore(subscribe, getSnapshot);
}
