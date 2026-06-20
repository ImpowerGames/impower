import type { GrammarNode } from "../classes/GrammarNode";

/** An individual element in a {@link GrammarStack}. */
export interface GrammarStackElement {
  /** The current parent {@link GrammarNode}. */
  node: GrammarNode;

  beginCaptures: string[];

  /**
   * The {@link ScopedRule} that opened this scope, used by the line+stack
   * tokenizer to continue the scope on subsequent lines. Typed loosely to avoid
   * an import cycle with the rules. Absent for the root (None) frame and for
   * scopes opened by the legacy whole-block path.
   */
  scopedRule?: any;

  /**
   * Whether this scope's content wrapper node has been opened yet (the line+
   * stack tokenizer opens it lazily on the first content token and closes it
   * with a zero-width token when the scope ends).
   */
  contentOpened?: boolean;
}
