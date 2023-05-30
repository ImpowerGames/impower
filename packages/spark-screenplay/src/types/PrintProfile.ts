export type PrintableTokenType =
  | "scene"
  | "action"
  | "shot"
  | "dialogue_character"
  | "dialogue_parenthetical"
  | "more"
  | "dialogue"
  | "transition"
  | "centered"
  | "synopsis"
  | "section"
  | "note";

export interface TokenPrintSettings {
  feed: number;
  max: number;
  italic?: boolean;
  color?: string;
  padding?: number;
  level_indent?: number;
  style?: string;
  feed_with_last_section?: boolean;
}

export interface PrintProfile
  extends Record<PrintableTokenType, TokenPrintSettings> {
  paper_size: string;
  font_size: number;
  lines_per_page: number;
  top_margin: number;
  page_width: number;
  page_height: number;
  left_margin: number;
  right_margin: number;
  font_width: number;
  font_height: number;
  line_spacing: number;
  page_number_top_margin: number;
  dual_max_factor: number;
  title_page: {
    top_start: number;
    left_side: string[];
    right_side: string[];
  };
  scene: TokenPrintSettings;
  action: TokenPrintSettings;
  shot: TokenPrintSettings;
  dialogue_character: TokenPrintSettings;
  dialogue_parenthetical: TokenPrintSettings;
  more: TokenPrintSettings;
  dialogue: TokenPrintSettings;
  transition: TokenPrintSettings;
  centered: TokenPrintSettings;
  synopsis: TokenPrintSettings;
  section: TokenPrintSettings;
  note: TokenPrintSettings;
}
