export const LAYOUT_VERBS = ["open", "close", "navigate", "clear"] as const;

export type LayoutVerb = (typeof LAYOUT_VERBS)[number];

export const LayoutVerb = {
  open: "open",
  close: "close",
  navigate: "navigate",
  clear: "clear",
} as const satisfies { [V in LayoutVerb]: V };

export const isLayoutVerb = (value: string): value is LayoutVerb =>
  (LAYOUT_VERBS as readonly string[]).includes(value);
