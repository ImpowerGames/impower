export type PrintableTokenType =
  | "chunk"
  | "section"
  | "scene"
  | "transition"
  | "action"
  | "dialogue_character_name"
  | "dialogue_line_parenthetical"
  | "dialogue"
  | "more"
  | "note";

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
  settings: Record<PrintableTokenType, TokenPrintSettings>;
}
