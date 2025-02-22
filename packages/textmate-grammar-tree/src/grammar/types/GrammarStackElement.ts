import type { GrammarNode } from "../classes/GrammarNode";
import { Rule } from "./Rule";

/** An individual element in a {@link GrammarStack}. */
export interface GrammarStackElement {
  /** The current parent {@link GrammarNode}. */
  node: GrammarNode;
  /** The rules to loop parsing with. */
  rules: Rule[];
  /**
   * A specific {@link Rule} that, when matched, should pop this element off
   * the stack.
   */
  end: Rule | null;

  beginCaptures: string[];
}
