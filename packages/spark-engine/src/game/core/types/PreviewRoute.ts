import type {
  RouteDecisionKind,
  ScriptStructure,
} from "@impower/sparkdown/src/compiler/utils/routeDecisions";
import type { RoutePin } from "@impower/sparkdown/src/compiler/utils/routePins";
import type { DocumentLocation } from "./DocumentLocation";

export type { RouteDecisionKind, RoutePin, ScriptStructure };

/** What a route's report reads of the scripts (`Game.previewRouteOf`),
 *  counting lines from 0: a line's text, and a script's loops and function
 *  bodies (`SparkdownCompiler.structureOf`). */
export interface ScriptSource {
  lineText(uri: string, line: number): string | undefined;
  structure(uri: string): ScriptStructure;
}

/** An option a menu on the route offered: its line, its text, which time
 *  the route was offered it there, from 1, and whether that offer is
 *  pinned. */
export interface PreviewRouteOption {
  location: DocumentLocation;
  text: string;
  offer: number;
  pinned?: true;
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
  /** Where a choice's menu is met, which stays the menu's whichever
   *  options it offers. */
  menu?: DocumentLocation;
  /** The options a choice's menu offered, in the order it lists them. */
  options?: PreviewRouteOption[];
  /** Set on a choice where a pin was not followed (`routeDecisions`). */
  notFollowed?: true;
  /** The pins of a choice's stop on options its menu did not offer there,
   *  which `options` does not list. */
  unofferedPins?: RoutePin[];
  /** The verdict the route forced. */
  verdict?: boolean;
  /** The passes a clipped loop ran before the route left it. */
  passes?: number;
}

export interface RunMeeting {
  pin: RoutePin;
  others: RoutePin[];
}

export interface RunMenu {
  sources: string[];
  taken: string;
}

/** The route the preview took to the line it shows, as `game/executed`
 *  reports it. */
export interface PreviewRoute {
  start: { scene?: string; location: DocumentLocation };
  /** The line the route ends at. */
  target: DocumentLocation;
  /** Its decisions, in route order. */
  decisions: PreviewRouteDecision[];
  /** The pins whose line holds no option, which the route ignored. */
  unresolvedPins?: RoutePin[];
}
