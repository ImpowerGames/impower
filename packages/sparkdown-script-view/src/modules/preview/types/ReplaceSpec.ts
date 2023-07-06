import { Language } from "@codemirror/language";
import { WidgetType } from "@codemirror/view";
import { NodeType } from "@lezer/common";
import { Tag } from "@lezer/highlight";

export interface ReplaceSpec {
  from: number;
  to: number;
  language: Language;
  highlighter: {
    style(tags: readonly Tag[]): string | null;
    scope?(node: NodeType): boolean;
  };
  widget?: {
    new (args: any): WidgetType;
  };
  block?: boolean;
  [other: string]: any;
}
