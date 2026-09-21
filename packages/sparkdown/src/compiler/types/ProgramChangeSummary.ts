/**
 * What one compile changed, relative to the compile before it.
 *
 * A route planned through a program stays valid for the next program wherever
 * that program still does the same thing, so the only question a client has to
 * answer is where the two programs start to differ. This is the compiler's
 * answer to it, and it is deliberately a SOURCE answer — a line number per
 * script — because that is the one coordinate a route step and an edit share.
 *
 * `confined` is the claim that makes the line numbers usable. Answering it
 * needs everything the compile knows about what it reused and what it rebuilt,
 * which is why it is computed here rather than inferred downstream.
 */
export interface ProgramChangeSummary {
  /** Identity of this program among the compiles of one compiler instance. */
  id: number;
  /** Identity of the program these changes are measured against. Absent on the
   *  first compile, which has nothing to compare with. */
  since?: number;
  /**
   * Per script uri, the first 0-based line at or after which this compile can
   * differ from the program it is measured against. A script that is absent
   * changed nothing.
   *
   * Lines strictly before the recorded one hold the same text in both programs,
   * so they are the same line in both — which is what lets a client compare a
   * position recorded against the old program with a line measured in the new
   * one.
   */
  changedFrom: { [uri: string]: number };
  /**
   * True when nothing outside those lines can change what the story does before
   * them.
   *
   * False is the answer whenever the compile cannot establish that, including
   * every case it has no evidence about: a first compile, a compile that threw,
   * one that emitted no bytecode and had no start position to route to, the
   * next compile after it that changes anything, and any of the cross-flow
   * hazards that make a flow's generated shape move without its own source
   * moving.
   */
  confined: boolean;
}
