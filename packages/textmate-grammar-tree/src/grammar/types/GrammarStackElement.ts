import type { GrammarNode } from "../classes/GrammarNode";

/** An individual element in a {@link GrammarStack}. */
export interface GrammarStackElement {
  /** The current parent {@link GrammarNode}. */
  node: GrammarNode;

  beginCaptures: string[];
}
