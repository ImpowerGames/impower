import type { RouteDecisionKind } from "@impower/sparkdown/src/compiler/utils/routeDecisions";
import type { DocumentLocation } from "./DocumentLocation";

export type { RouteDecisionKind };

/** One decision the preview's route made (`routeDecisions`), placed in the
 *  script. */
export interface PreviewRouteDecision {
  kind: RouteDecisionKind;
  /** The option taken, or the decision a verdict is for. */
  location: DocumentLocation;
  /** The option's text, or the text of the verdict's line. */
  text: string;
  /** Which time the route is offered the option it took, from 1. */
  meeting?: number;
  /** The verdict the route forced. */
  verdict?: boolean;
  /** The passes a clipped loop ran before the route left it. */
  passes?: number;
}

/** The route the preview took to the line it shows, as `game/executed`
 *  reports it. */
export interface PreviewRoute {
  /** Where the route starts: the top of the scene `scene` names, or of the
   *  top-level content of the script `location` is in when it names none. */
  start: { scene?: string; location: DocumentLocation };
  /** The line the route ends at. */
  target: DocumentLocation;
  /** Its decisions, in route order. */
  decisions: PreviewRouteDecision[];
}
