import { FormattedText } from "./FormattedText";
import { LineOptions } from "./LineOptions";
import { PagePosition } from "./PagePosition";
import { BlockTokenType, ScreenplayTokenType } from "./ScreenplayTokenType";

export interface PageLine extends LineOptions {
  tag: ScreenplayTokenType;
  content: FormattedText[];
}

export interface PageBreak {
  tag: "page_break";
}

export interface Separator {
  tag: "separator";
}

export interface MetaLayout {
  tag: "meta";
  positions: Partial<Record<PagePosition, PageLine[]>>;
}

export interface SplitLayout {
  tag: "dual";
  positions: Partial<Record<"l" | "r", PageLine[]>>;
}

export interface BlockLayout {
  tag: BlockTokenType;
  lines: PageLine[];
}

export type DocumentSpan =
  | PageBreak
  | Separator
  | MetaLayout
  | SplitLayout
  | BlockLayout;
