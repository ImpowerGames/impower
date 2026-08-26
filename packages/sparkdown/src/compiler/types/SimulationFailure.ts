/**
 * Why a preview could not be simulated from the top of its scene down to the
 * line the author is previewing from.
 *
 * The status bar has always shown THAT it failed — the row turns red and
 * carries a `🞪` between the two lines involved — and nothing more. That is not
 * enough to act on, because the four causes below want four different things
 * from the author, and a single message covering all of them has to hedge:
 * "the scene may be too long" sends someone off to restructure a script whose
 * real problem is a choice that never picks the branch they are looking at.
 *
 * Each value is a cause that can actually be told apart at the point the
 * attempt gives up. It lives here, beside the route planner, rather than with
 * the engine's messages, because both the engine and the editor's preview
 * worker reach the same conclusions and must name them the same way.
 */
export type SimulationFailure =
  /** A ceiling stopped the route search before it had explored everything, so
   *  whether a route exists is still unknown. A story that loops forever and a
   *  scene too long to search both land here. */
  | "timeout"
  /** The route search explored every branch it could reach and none of them
   *  arrived at the line, so nothing about the search itself is at fault. */
  | "exhausted"
  /** The line is not part of the story flow at all — front matter, a `define`
   *  block, the gap between scenes — so there was never a route to look for. */
  | "unroutable"
  /** A route WAS found, but replaying it stopped somewhere short of the line:
   *  the plan and the run disagreed. */
  | "diverged";
