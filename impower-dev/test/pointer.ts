import { act } from "preact/test-utils";

let coarse = false;
const changes: (() => void)[] = [];
const base = window.matchMedia;

window.matchMedia = ((query: string) => {
  if (!query.includes("pointer: coarse")) {
    return base(query);
  }
  const listeners = new Set<() => void>();
  changes.push(() => listeners.forEach((listener) => listener()));
  return {
    get matches() {
      return coarse;
    },
    media: query,
    onchange: null,
    addEventListener: (_: string, listener: () => void) =>
      listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) =>
      listeners.delete(listener),
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  } as unknown as MediaQueryList;
}) as typeof window.matchMedia;

export const setCoarsePointer = async (next: boolean) => {
  coarse = next;
  await act(async () => {
    changes.forEach((change) => change());
  });
};
