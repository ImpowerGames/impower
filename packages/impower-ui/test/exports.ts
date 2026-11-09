import { options, type VNode } from "preact";
import * as kit from "../src/components";

export const NOT_COMPONENTS: readonly string[] = [
  "announce",
  "buttonVariants",
  "choiceGroupVariants",
  "choiceOptionVariants",
  "featureCardVariants",
  "jumpChipVariants",
  "liveRegionVariants",
  "pageFrameBackVariants",
  "pageFrameInnerVariants",
  "pageFrameIntroVariants",
  "pageFrameTitleVariants",
  "pageFrameVariants",
  "railIndexJumpVariants",
  "railIndexRowVariants",
  "selectVariants",
  "settingsRowVariants",
  "switchVariants",
  "sliderVariants",
  "portraitThumbnailVariants",
  "portraitCropLabel",
  "textFieldVariants",
  "themeSwatchVariants",
  "useAnnouncer",
  "componentRegistry",
  "dialogVariants",
  "disclosureSummaryVariants",
  "disclosureVariants",
  "dropdownRadioItemVariants",
  "HOLD_REPEAT_DELAY_MS",
  "HOLD_REPEAT_INTERVAL_MS",
  "LIST_ROW_INDENT",
  "listRowBodyVariants",
  "listRowLabelVariants",
  "listRowVariants",
  "layoutState",
  "sparkLogoVariants",
  "pointerState",
  "popoverVariants",
  "railState",
  "sheetVariants",
  "sidebarLayoutVariants",
  "toastVariants",
  "useCoarsePointer",
  "useHoldRepeat",
  "useLayout",
  "useRailDefault",
  "useMountTransition",
  "VIRTUAL_LIST_ROW_HEIGHT",
  "virtualListSlotVariants",
  "virtualListVariants",
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
