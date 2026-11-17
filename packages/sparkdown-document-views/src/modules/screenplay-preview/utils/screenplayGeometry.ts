import type { PrintProfile } from "../../../../../sparkdown-screenplay/src/types/PrintProfile";
import type { ScreenplayConfig } from "../../../../../sparkdown-screenplay/src/types/ScreenplayConfig";
import {
  levelIndent,
  lineLeftMargin,
  lineMaxWidth,
  type PlacedLine,
  PRINTED_BASELINE,
  printProfileOf,
  rowHeight,
  SCENE_NUMBER_LEFT_GAP,
  SCENE_NUMBER_RIGHT_GAP,
} from "../../../../../sparkdown-screenplay/src/utils/printGeometry";
import {
  TITLE_REGIONS,
  type TitleRegion,
  type TitleRegionHeights,
  titlePageLayout,
} from "../../../../../sparkdown-screenplay/src/utils/titlePageLayout";

const POINTS_PER_INCH = 72;

const ems = (profile: PrintProfile, inches: number) =>
  `${Math.round(((inches * POINTS_PER_INCH) / (profile.font_size ?? 12)) * 10000) / 10000}em`;

export const printedLineStyle = (config: ScreenplayConfig | undefined, line: PlacedLine) => {
  const profile = printProfileOf(config);
  return `margin-left: ${ems(profile, lineLeftMargin(profile, line) - profile.left_margin)}; width: ${ems(profile, lineMaxWidth(profile, line))};`;
};

export const printedNameStyle = (config: ScreenplayConfig | undefined, line: PlacedLine, level: number) => {
  const profile = printProfileOf(config);
  return `margin-left: ${ems(profile, lineLeftMargin(profile, line) + levelIndent(profile, line.tag, level) - profile.left_margin)}; width: ${ems(profile, lineMaxWidth(profile, line))};`;
};

export const printedPageStyle = (config: ScreenplayConfig | undefined) => {
  const profile = printProfileOf(config);
  const textWidth = profile.page_width - profile.left_margin - profile.right_margin;
  return [
    `--sp-text-width: ${ems(profile, textWidth)}`,
    `--sp-margin-left: ${ems(profile, profile.left_margin)}`,
    `--sp-margin-right: ${ems(profile, profile.right_margin)}`,
    `--sp-row: ${ems(profile, rowHeight(profile))}`,
    `--sp-scene-number-left-gap: ${SCENE_NUMBER_LEFT_GAP}ch`,
    `--sp-scene-number-right-gap: ${SCENE_NUMBER_RIGHT_GAP}ch`,
  ].join("; ");
};

export interface PrintedTitlePage {
  baseline: string;
  height: string;
  rows: number;
  tops: Record<TitleRegion, string>;
}

export const printedTitlePage = (config: ScreenplayConfig | undefined, titleRows: TitleRegionHeights): PrintedTitlePage => {
  const profile = printProfileOf(config);
  const row = rowHeight(profile);
  const heights: TitleRegionHeights = {};
  for (const region of TITLE_REGIONS) heights[region] = (titleRows[region] ?? 0) * row;
  const { innerTop, innerHeight, tops } = titlePageLayout(profile, heights);
  return {
    baseline: ems(profile, (PRINTED_BASELINE * (profile.font_size ?? 12)) / POINTS_PER_INCH),
    height: ems(profile, innerHeight),
    rows: innerHeight / row,
    tops: Object.fromEntries(TITLE_REGIONS.map((region) => [region, ems(profile, tops[region] - innerTop)])) as Record<TitleRegion, string>,
  };
};
