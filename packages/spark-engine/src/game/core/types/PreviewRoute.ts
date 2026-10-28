import type {
  RouteDecisionKind,
  ScriptLoop,
} from "@impower/sparkdown/src/compiler/utils/routeDecisions";
import type { DocumentLocation } from "./DocumentLocation";

export type { RouteDecisionKind, ScriptLoop };

/** What a route's report reads of the scripts (`Game.previewRouteOf`),
 *  counting lines from 0: a line's text, and a script's loops
 *  (`SparkdownCompiler.loopsOf`). */
export interface ScriptSource {
  lineText(uri: string, line: number): string | undefined;
  loops(uri: string): readonly ScriptLoop[];
}

/** One decision the preview's route made (`routeDecisions`), placed in the
 *  script. */
export interface PreviewRouteDecision {
  kind: RouteDecisionKind;
  /** The option taken, the decision a forced verdict is for, or a clipped
   *  loop's first line. */
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
