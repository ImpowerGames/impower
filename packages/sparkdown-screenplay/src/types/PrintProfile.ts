import { ScreenplayTokenType } from "./ScreenplayTokenType";

export interface TokenPrintSettings {
  left_margin: number;
  right_margin: number;
  dual_first_left_margin?: number;
  dual_first_right_margin?: number;
  dual_second_left_margin?: number;
  dual_second_right_margin?: number;
  level_indent?: number;
  color?: string;
  italic?: boolean;
  align?: string;
}

export interface PrintProfile {
  paper_size: string;
  page_width: number;
  page_height: number;
  top_margin: number;
  bottom_margin: number;
  left_margin: number;
  right_margin: number;
  page_number_top_margin: number;
  page_footer_bottom_margin: number;
  font_size: number;
  color?: string;
  line_spacing: number;
  settings: Partial<Record<ScreenplayTokenType, TokenPrintSettings>>;
}
