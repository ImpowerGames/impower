import { options, type VNode } from "preact";
import * as kit from "../src/components";

export const NOT_COMPONENTS: readonly string[] = [
  "announce",
  "buttonVariants",
  "choiceGroupVariants",
  "choiceOptionVariants",
  "colorChipVariants",
  "colorWellVariants",
  "featureCardVariants",
  "jumpChipVariants",
  "keysChipVariants",
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
  "tabbedPageHeaderVariants",
  "tabbedPageTitleVariants",
  "tabbedPageVariants",
  "textFieldVariants",
  "themeSwatchVariants",
  "useAnnouncer",
  "componentRegistry",
  "dialogVariants",
  "filterChipVariants",
  "MESSAGE_ENTRY_ROW_HEIGHT",
  "FIX_MENU_LABEL",
  "messageEntryGlyphVariants",
  "messageEntryVariants",
  "PANEL_CARD_HEIGHT",
  "panelCardHeadVariants",
  "panelCardRowVariants",
  "disclosureSummaryVariants",
  "disclosureVariants",
  "dropdownLabelVariants",
  "dropdownRadioItemVariants",
  "HOLD_REPEAT_DELAY_MS",
  "HOLD_REPEAT_INTERVAL_MS",
  "LIST_ROW_INDENT",
  "listRowBadgeVariants",
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
  "treeToggleVariants",
  "useCoarsePointer",
  "useHoldRepeat",
  "useLayout",
  "useRailDefault",
  "useSheetOpen",
  "useMountTransition",
  "VIRTUAL_LIST_ROW_HEIGHT",
  "virtualListColumns",
  "virtualListSlotVariants",
  "virtualListVariants",
  "thumbnailVariants",
  "thumbnailImageVariants",
  "folderCoverVariants",
  "FOLDER_COVER_LIMIT",
  "variantsChipVariants",
  "variantsLabel",
  "variantsBadgeVariants",
  "wheelPickerVariants",
  "wheelIndexAt",
  "WHEEL_ROW",
  "WHEEL_SHOWN",
  "tileVariants",
  "tileOpenVariants",
  "tileMarkVariants",
  "tileMediaVariants",
  "tileLabelVariants",
  "tileHeight",
  "TILE_GAP",
  "TILE_MIN_WIDTH",
  "zoomFrameVariants",
  "zoomFrameContentVariants",
  "panelHeadVariants",
  "panelHeadTitleVariants",
  "detailListVariants",
  "carouselVariants",
  "carouselTrackVariants",
  "carouselItemVariants",
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
