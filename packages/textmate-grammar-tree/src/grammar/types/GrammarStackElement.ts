import type { GrammarNode } from "../classes/GrammarNode";

export interface GrammarStackElement {
  node: GrammarNode;

  beginCaptures: string[];

  enclosingAnchor: number;

  beginCapturedLineBreak: boolean;
}
