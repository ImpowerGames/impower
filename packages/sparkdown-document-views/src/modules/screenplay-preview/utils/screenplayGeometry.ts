import type { PrintProfile } from "../../../../../sparkdown-screenplay/src/types/PrintProfile";
import type { ScreenplayConfig } from "../../../../../sparkdown-screenplay/src/types/ScreenplayConfig";
import {
  levelIndent,
  lineLeftMargin,
  lineMaxWidth,
  type PlacedLine,
  printProfileOf,
  SCENE_NUMBER_LEFT_GAP,
  SCENE_NUMBER_RIGHT_GAP,
} from "../../../../../sparkdown-screenplay/src/utils/printGeometry";

const POINTS_PER_INCH = 72;

const ems = (profile: PrintProfile, inches: number) =>
  `${Math.round(((inches * POINTS_PER_INCH) / (profile.font_size ?? 12)) * 10000) / 10000}em`;

export const printedLineStyle = (config: ScreenplayConfig | undefined, line: PlacedLine) => {
  const profile = printProfileOf(config);
  return `margin-left: ${ems(profile, lineLeftMargin(profile, line) - profile.left_margin)}; width: ${ems(profile, lineMaxWidth(profile, line))};`;
};

export const printedNameStyle = (config: ScreenplayConfig | undefined, line: PlacedLine, level: number) => {
  const profile = printProfileOf(config);
  return `margin-left: ${ems(profile, lineLeftMargin(profile, line) + levelIndent(profile, line.tag, level) - profile.left_margin)};`;
};

export const printedPageStyle = (config: ScreenplayConfig | undefined) => {
  const profile = printProfileOf(config);
  const textWidth = profile.page_width - profile.left_margin - profile.right_margin;
  return [
    `--sp-text-width: ${ems(profile, textWidth)}`,
    `--sp-margin-left: ${ems(profile, profile.left_margin)}`,
    `--sp-margin-right: ${ems(profile, profile.right_margin)}`,
    `--sp-scene-number-left-gap: ${SCENE_NUMBER_LEFT_GAP}ch`,
    `--sp-scene-number-right-gap: ${SCENE_NUMBER_RIGHT_GAP}ch`,
  ].join("; ");
};
