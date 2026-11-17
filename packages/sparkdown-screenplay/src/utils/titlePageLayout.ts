import type { PrintProfile } from "../types/PrintProfile";

export const TITLE_REGIONS = ["tl", "tc", "tr", "cc", "bl", "br"] as const;

export type TitleRegion = (typeof TITLE_REGIONS)[number];

export const TITLE_PLACEMENT_ORDER: readonly TitleRegion[] = ["tl", "tc", "tr", "bl", "br", "cc"];

export type TitleRegionHeights = Partial<Record<TitleRegion, number>>;

export interface TitlePageLayout {
  innerTop: number;
  innerHeight: number;
  tops: Record<TitleRegion, number>;
}

export const titlePageLayout = (profile: PrintProfile, heights: TitleRegionHeights): TitlePageLayout => {
  const innerTop = profile.top_margin;
  const innerHeight = profile.page_height - profile.top_margin - profile.bottom_margin;
  const height = (region: TitleRegion) => heights[region] ?? 0;
  const topHeight = Math.max(height("tl"), height("tc"), height("tr"), 0);
  const bottomHeight = Math.max(height("bl"), height("br"), 0);
  return {
    innerTop,
    innerHeight,
    tops: {
      tl: innerTop,
      tc: innerTop,
      tr: innerTop,
      cc: innerTop + (innerHeight - topHeight - bottomHeight) / 2 - height("cc") / 2,
      bl: innerTop + innerHeight - height("bl"),
      br: innerTop + innerHeight - height("br"),
    },
  };
};
