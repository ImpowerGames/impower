import { FormattedText } from "./FormattedText";
import { PagePosition } from "./PagePosition";
import { ScreenplayTokenType } from "./ScreenplayTokenType";

export interface PageLine {
  tag: ScreenplayTokenType | "separator";
  scene?: string | number;
  level?: number;
  content: FormattedText[];
}

export interface SplitLayout {
  tag: "split";
  positions: Partial<Record<"l" | "r", PageLine[]>>;
}

export interface MetaLayout {
  tag: "meta";
  positions: Partial<Record<PagePosition, PageLine[]>>;
}

export type DocumentSpan = PageLine | MetaLayout | SplitLayout;
