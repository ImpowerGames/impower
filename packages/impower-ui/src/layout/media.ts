import {
  coarsePointerQuery,
  layoutQueries,
  type Layout,
  type Pointer,
} from "./breakpoints";

export type MediaState<T extends string> = {
  current: () => T;
  subscribe: (listener: (value: T) => void) => () => void;
};

function mediaState<T extends string>(
  attribute: "layout" | "pointer",
  queries: readonly string[],
  read: (matches: readonly boolean[]) => T,
  fallback: T,
): MediaState<T> {
  const listeners = new Set<(value: T) => void>();
  let lists: MediaQueryList[] | undefined;
  let value = fallback;

  const sync = (from: MediaQueryList[]) => {
    value = read(from.map((list) => list.matches));
    document.documentElement.dataset[attribute] = value;
  };

  const connect = () => {
    if (lists || typeof window === "undefined") {
      return;
    }
    const connected = queries.map((query) => window.matchMedia(query));
    lists = connected;
    sync(connected);
    const onChange = () => {
      const previous = value;
      sync(connected);
      if (value !== previous) {
        listeners.forEach((listener) => listener(value));
      }
    };
    connected.forEach((list) => list.addEventListener("change", onChange));
  };

  return {
    current: () => {
      connect();
      return value;
    },
    subscribe: (listener) => {
      connect();
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export const layoutState: MediaState<Layout> = mediaState(
  "layout",
  [layoutQueries.compact, layoutQueries.desktop],
  ([compact, desktop]) => (desktop ? "desktop" : compact ? "compact" : "phone"),
  "desktop",
);

export const pointerState: MediaState<Pointer> = mediaState(
  "pointer",
  [coarsePointerQuery],
  ([coarse]) => (coarse ? "coarse" : "fine"),
  "fine",
);
