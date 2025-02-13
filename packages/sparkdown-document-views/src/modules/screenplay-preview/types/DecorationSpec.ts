import { HighlightStyle, Language } from "@codemirror/language";

export interface DecorationSpec {
  type: string;
  from: number;
  to?: number;
  language?: Language;
  highlighter?: HighlightStyle;
}
