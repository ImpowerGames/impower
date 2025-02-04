import { ScreenplayTokenType } from "./ScreenplayTokenType";

export interface TokenPrintSettings {
  feed: number;
  max: number;
  italic?: boolean;
  color?: string;
  padding?: number;
  level_indent?: number;
  align?: string;
  feed_with_last_section?: boolean;
}

export interface PrintProfile {
  paper_size: string;
  page_width: number;
  page_height: number;
  lines_per_page: number;
  top_margin: number;
  left_margin: number;
  right_margin: number;
  page_number_top_margin: number;
  font_size: number;
  font_width: number;
  font_height: number;
  line_spacing: number;
  dual_max_factor: number;
  settings: Partial<
    Record<ScreenplayTokenType | "default", TokenPrintSettings>
  >;
}
