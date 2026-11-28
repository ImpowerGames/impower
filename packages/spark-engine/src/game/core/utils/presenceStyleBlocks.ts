export type PresenceStyleMotion = "show" | "hide";

const PRESENCE_BLOCKS: Record<PresenceStyleMotion, RegExp> = {
  show: /@(?:initial|show)(?![\p{L}\p{N}_-])/u,
  hide: /@hide(?![\p{L}\p{N}_-])/u,
};

const found = new WeakMap<object, Record<PresenceStyleMotion, boolean>>();

export const presenceStyleBlocks = (styles: Record<string, unknown> | undefined): Record<PresenceStyleMotion, boolean> => {
  const known = styles ? found.get(styles) : undefined;
  if (known) {
    return known;
  }
  const blocks = scanPresenceStyleBlocks(styles);
  if (styles) {
    found.set(styles, blocks);
  }
  return blocks;
};

const scanPresenceStyleBlocks = (styles: Record<string, unknown> | undefined): Record<PresenceStyleMotion, boolean> => {
  const blocks: Record<PresenceStyleMotion, boolean> = { show: false, hide: false };
  const visit = (value: unknown) => {
    if (value == null || typeof value !== "object") {
      return;
    }
    for (const [key, inner] of Object.entries(value)) {
      if (inner == null || typeof inner !== "object") {
        continue;
      }
      for (const motion of ["show", "hide"] as const) {
        if (PRESENCE_BLOCKS[motion].test(key)) {
          blocks[motion] = true;
        }
      }
      visit(inner);
    }
  };
  for (const [name, style] of Object.entries(styles ?? {})) {
    if (!name.startsWith("$")) {
      visit(style);
    }
  }
  return blocks;
};
