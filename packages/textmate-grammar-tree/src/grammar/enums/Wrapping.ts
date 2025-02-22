export enum Wrapping {
  /** The {@link ParserNode} in this match contains the entirety of the branch. */
  FULL,
  /** The {@link ParserNode} in this match begins the branch. */
  BEGIN,
  /** The {@link ParserNode} in this match ends the branch. */
  END,
}
