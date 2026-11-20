import { PRINT_PROFILES } from "../constants/PRINT_PROFILES";
import type { PageLine } from "../types/DocumentSpan";
import type { FormattedText } from "../types/FormattedText";
import type { PagePosition } from "../types/PagePosition";
import type { PrintProfile } from "../types/PrintProfile";
import type { ScreenplayConfig } from "../types/ScreenplayConfig";
import type { ScreenplayTokenType } from "../types/ScreenplayTokenType";
import { scriptAdvanceOf } from "./scriptFontAdvance";

export const SCRIPT_FONT_ADVANCE = scriptAdvanceOf("normal", 0x20);

export const EMOJI_FONT_ADVANCE = 1275 / 1024;

export const PRINTED_LINE_HEIGHT = 1;

export const PRINTED_BASELINE = 683 / 1000 + 1421 / 2048;

export const SCENE_NUMBER_LEFT_GAP = 4;

export const SCENE_NUMBER_RIGHT_GAP = 1;

export const printProfileOf = (config?: ScreenplayConfig): PrintProfile =>
  PRINT_PROFILES[config?.screenplay_print_paper_size || ""] || PRINT_PROFILES.usletter;

export type PlacedLine = Pick<PageLine, "tag" | "position">;

const tagSettings = (profile: PrintProfile, tag: string) =>
  profile.settings[tag as ScreenplayTokenType];

export const cellWidth = (profile: PrintProfile) =>
  (SCRIPT_FONT_ADVANCE * (profile.font_size ?? 12)) / 72;

export const rowHeight = (profile: PrintProfile) => (PRINTED_LINE_HEIGHT * (profile.font_size ?? 12)) / 72;

export const emojiWidth = (profile: PrintProfile) => (EMOJI_FONT_ADVANCE * (profile.font_size ?? 12)) / 72;

export const lineLeftMargin = (profile: PrintProfile, line: PlacedLine) => {
  const settings = tagSettings(profile, line.tag);
  const margin =
    line.position === "l"
      ? settings?.dual_first_left_margin
      : line.position === "r"
        ? settings?.dual_second_left_margin
        : settings?.left_margin;
  return margin ?? profile.left_margin ?? 0;
};

export const lineRightMargin = (profile: PrintProfile, line: PlacedLine) => {
  const settings = tagSettings(profile, line.tag);
  const margin =
    line.position === "l"
      ? settings?.dual_first_right_margin
      : line.position === "r"
        ? settings?.dual_second_right_margin
        : settings?.right_margin;
  return margin ?? profile.right_margin ?? 0;
};

export const lineMaxWidth = (profile: PrintProfile, line: PlacedLine) =>
  profile.page_width - lineLeftMargin(profile, line) - lineRightMargin(profile, line);

export const titleRegionWidth = (profile: PrintProfile, position: PagePosition | undefined) => {
  const innerWidth = profile.page_width - profile.left_margin - profile.right_margin;
  if (position === "tl" || position === "tc" || position === "tr") return innerWidth / 3;
  if (position === "bl" || position === "br") return innerWidth / 2;
  if (position === "cc") return innerWidth;
  return undefined;
};

export const levelIndent = (profile: PrintProfile, tag: string | undefined, level: number) =>
  level * ((tag ? tagSettings(profile, tag)?.level_indent : undefined) ?? 0);

export const hangingGroup = <T extends Pick<FormattedText, "text" | "hang">>(content: T[]): { lead?: T; rest: T[]; hang: number } => {
  const lead = content[0];
  if (!lead?.hang || content.length < 2) return { rest: content, hang: 0 };
  return { lead, rest: content.slice(1), hang: lead.hang };
};
