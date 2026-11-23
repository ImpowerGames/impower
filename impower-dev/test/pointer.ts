import { act } from "preact/test-utils";

let coarse = false;
let phone = false;
const changes: (() => void)[] = [];
const base = window.matchMedia;

const live = (query: string, matches: () => boolean) => {
  const listeners = new Set<() => void>();
  changes.push(() => listeners.forEach((listener) => listener()));
  return {
    get matches() {
      return matches();
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
};

window.matchMedia = ((query: string) => {
  if (query.includes("pointer: coarse")) {
    return live(query, () => coarse);
  }
  if (query.includes("min-width")) {
    const outer = base(query);
    return live(query, () => !phone && outer.matches);
  }
  return base(query);
}) as typeof window.matchMedia;

const notify = () =>
  act(async () => {
    changes.forEach((change) => change());
  });

export const setCoarsePointer = async (next: boolean) => {
  coarse = next;
  await notify();
};

export const setPhoneLayout = async (next: boolean) => {
  phone = next;
  await notify();
};
