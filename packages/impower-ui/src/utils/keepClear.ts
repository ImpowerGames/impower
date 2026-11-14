import type { RefObject } from "preact";

export type KeepClear = RefObject<HTMLElement | null>;

export const KEEP_CLEAR_GAP = 6;

export const clearLine = (keepClear: KeepClear | undefined): number | undefined => {
  const element = keepClear?.current;
  return element ? element.getBoundingClientRect().bottom + KEEP_CLEAR_GAP : undefined;
};
