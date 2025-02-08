import { HighlightStyle, Language } from "@codemirror/language";
import { WidgetType } from "@codemirror/view";
import { MarkupContent } from "./MarkupContent";

export interface ReplaceSpec {
  type: "replace";
  from: number;
  to: number;
  language?: Language;
  highlighter?: HighlightStyle;
  widget?: {
    new (args: any): WidgetType;
  };
  block?: boolean;
  content?: MarkupContent[];
  [other: string]: any;
}
