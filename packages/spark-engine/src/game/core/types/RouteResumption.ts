import type { RouteResumePoint } from "@impower/sparkdown/src/compiler/utils/planRoute";

/**
 * What a route planned in an earlier program still offers the one now loaded.
 *
 * Read by a caller about to plan a route to the author's line, which is free to
 * ignore all of it and search from the top of the scene — every field here only
 * ever makes that work smaller.
 */
export interface RouteResumption {
  /**
   * How many of the planned route's leading steps the new program still agrees
   * with, and so how far into it a checkpoint may be taken from.
   *
   * Absent when the program says nothing about what it changed, which is not
   * the same as zero: zero is the answer that nothing may be reused, and absent
   * is the answer that this is not a question the program can be asked.
   */
  validSteps?: number;
  /**
   * The step a replay or a search restarts at: the one the restored story is
   * standing on, so the next one to run rather than the last one taken.
   *
   * Absent when the unchanged part of the route holds no checkpoint that can be
   * resumed from.
   */
  stepIndex?: number;
  /** The checkpoint that step's story comes from. */
  checkpointIndex?: number;
  /** That position, as a search reads it. Built here rather than on request,
   *  because establishing where the story stands is what produced it. */
  resumeFrom?: RouteResumePoint;
  /**
   * True when the route still reaches the wanted path and everything the new
   * program changed sits after the last checkpoint it captured — so replaying
   * the route's tail answers the whole question and no search is needed.
   *
   * It is a claim about what CAN be skipped, not a promise: the replay runs in
   * the new program, which may not follow the route to the end, and a caller
   * that finds it did not still has to search.
   */
  replayOnly: boolean;
}
