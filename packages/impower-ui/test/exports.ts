import { options, type VNode } from "preact";
import * as kit from "../src/components";

export const NOT_COMPONENTS: readonly string[] = [
  "buttonVariants",
  "componentRegistry",
  "dialogVariants",
  "layoutState",
  "sparkLogoVariants",
  "pointerState",
  "railState",
  "sheetVariants",
  "sidebarLayoutVariants",
  "toastVariants",
  "useCoarsePointer",
  "useLayout",
  "useRailDefault",
  "useSheetOpen",
  "useMountTransition",
];

export const exported = Object.entries(kit) as [string, unknown][];

export const componentNames = exported
  .map(([name]) => name)
  .filter((name) => !NOT_COMPONENTS.includes(name));

export const exportedValue = (name: string): unknown => kit[name as keyof typeof kit];

export const collectingTypes = async <T,>(run: () => T | Promise<T>): Promise<{ result: T; types: Set<unknown> }> => {
  const previous = options.diffed;
  const types = new Set<unknown>();
  options.diffed = (vnode: VNode) => {
    types.add(vnode.type);
    previous?.(vnode);
  };
  try {
    return { result: await run(), types };
  } finally {
    options.diffed = previous;
  }
};
