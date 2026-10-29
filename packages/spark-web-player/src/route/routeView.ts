import type {
  PreviewRoute,
  PreviewRouteDecision,
  PreviewRouteOption,
  RoutePin,
} from "@impower/spark-engine/src/game/core/types/PreviewRoute";
import type { DocumentLocation } from "@impower/spark-engine/src/game/core/types/DocumentLocation";

/** The kinds the route list's toggles show and hide. */
export type RouteKind = "pinned" | "auto" | "forced" | "clipped";

export const ROUTE_KINDS: readonly RouteKind[] = [
  "pinned",
  "auto",
  "forced",
  "clipped",
];

/** Which kinds the route list shows. */
export type RouteToggles = Record<RouteKind, boolean>;

export const DEFAULT_ROUTE_TOGGLES: RouteToggles = {
  pinned: true,
  auto: true,
  forced: true,
  clipped: true,
};

export const ROUTE_KIND_LABELS: Record<RouteKind, string> = {
  pinned: "Pinned",
  auto: "Auto",
  forced: "Forced",
  clipped: "Clipped",
};

/** Each toggle's hover: what its kind means, said once. */
export const ROUTE_KIND_MEANINGS: Record<RouteKind, string> = {
  pinned: "Choices you pinned",
  auto: "Choices the preview made where you have no pin",
  forced:
    "Conditions the preview forced to reach the target line; the game would not go this way",
  clipped:
    "Loops the preview left before the game would; the game runs them to the end",
};

/** The preview's route failing: why, and where it was to start and end. */
export interface RouteFailure {
  message: string;
  /** The scene the route was to start at the top of, or nothing for the
   *  top-level content. */
  scene?: string;
  start?: DocumentLocation;
  target?: DocumentLocation;
}

/**
 * Everything the route button and the route list show, which they render
 * from and nothing else: the route the preview took, or why it found none,
 * whether the list is open, which kinds it shows, every pin in the project
 * as the host keeps it, and a note when the host did not save a change to
 * them.
 */
export interface RouteViewState {
  route?: PreviewRoute;
  failure?: RouteFailure;
  open: boolean;
  toggles: RouteToggles;
  pins: RoutePin[];
  pinNote?: string;
}

/** What the list says when the host does not save a change to the pins. */
export const PIN_NOT_SAVED = "The pin was not saved.";

/** The change to the pins the author asked for (`preview/changeRoutePins`). */
export interface RoutePinChange {
  add?: RoutePin[];
  remove?: RoutePin[];
  removeAll?: boolean;
}

const samePin = (a: RoutePin, b: RoutePin) =>
  a.uri === b.uri && a.line === b.line && a.offer === b.offer;

/** The pin on `option` at its offer at the stop it was offered at. */
export const pinOf = (option: PreviewRouteOption): RoutePin => ({
  uri: option.location.uri,
  line: option.location.range.start.line,
  offer: option.offer,
});

/** Whether a pin the host keeps is on `option` at its offer there. */
export const isPinned = (pins: RoutePin[], option: PreviewRouteOption) =>
  pins.some((pin) => samePin(pin, pinOf(option)));

/** The pins at a choice's stop the host keeps: one per option offered there
 *  that has one, and the pins of its menu's options it did not offer. */
const pinsAtStop = (pins: RoutePin[], decision: PreviewRouteDecision) =>
  [
    ...(decision.options ?? []).map(pinOf),
    ...(decision.unofferedPins ?? []),
  ].filter((at) => pins.some((pin) => samePin(pin, at)));

/** Pinning `option` at its stop: its pin, and every other pin at that stop
 *  removed. Pressing a pinned option unpins it. */
export const pinChange = (
  pins: RoutePin[],
  decision: PreviewRouteDecision,
  option: PreviewRouteOption,
): RoutePinChange => {
  const pin = pinOf(option);
  if (isPinned(pins, option)) {
    return { remove: [pin] };
  }
  return {
    add: [pin],
    remove: pinsAtStop(pins, decision).filter((at) => !samePin(at, pin)),
  };
};

/** Unpinning a stop: every pin at it removed. */
export const unpinChange = (
  pins: RoutePin[],
  decision: PreviewRouteDecision,
): RoutePinChange => ({ remove: pinsAtStop(pins, decision) });

/** Whether a stop has a pin the host keeps. */
export const stopIsPinned = (
  pins: RoutePin[],
  decision: PreviewRouteDecision,
): boolean => pinsAtStop(pins, decision).length > 0;

/** The pins `change` leaves of `pins`, in the order the host would keep
 *  them, which the list shows until the host answers. */
export const changedPins = (
  pins: RoutePin[],
  change: RoutePinChange,
): RoutePin[] => {
  const kept = change.removeAll
    ? []
    : pins.filter(
        (pin) => !(change.remove ?? []).some((gone) => samePin(gone, pin)),
      );
  for (const pin of change.add ?? []) {
    if (!kept.some((at) => samePin(at, pin))) {
      kept.push(pin);
    }
  }
  return kept;
};

/** The sentence a choice's pin control says about its stop. */
export const choiceSentence = (
  decision: PreviewRouteDecision,
  target: DocumentLocation,
): string => {
  const line = lineOf(target);
  if (decision.notFollowed) {
    return `Previewing line ${line}, which can't be reached through your pin, so the preview took another option here. The pin still holds for other lines.`;
  }
  if (decision.kind === "pinned") {
    return "The preview takes your pinned option here.";
  }
  return `No pin. The preview chose this option to reach line ${line}.`;
};

/** An unresolved pin as the list names it. */
export const unresolvedPinText = (pin: RoutePin, nameOf: ScriptName) =>
  `Pin at line ${pin.line + 1} of ${nameOf(pin.uri)}: no option on this line`;

/** How a host names a script in the route's text: its path, relative to the
 *  project and without its extension. */
export type ScriptName = (uri: string) => string;

/** The status icon the route button shows: the first that applies. */
export type RouteIcon = "failure" | "forced" | "clipped" | "pinned" | null;

export const routeIcon = (state: RouteViewState): RouteIcon => {
  if (state.failure) {
    return "failure";
  }
  const decisions = state.route?.decisions ?? [];
  if (decisions.some((d) => d.kind === "forced")) {
    return "forced";
  }
  if (decisions.some((d) => d.kind === "clipped")) {
    return "clipped";
  }
  if (decisions.some((d) => d.kind === "pinned")) {
    return "pinned";
  }
  return null;
};

const lineOf = (location: DocumentLocation) => location.range.start.line + 1;

/** Where a route starts and ends, as the button reads it: the scene, or the
 *  script for the top-level content, then the start's line and the
 *  target's, which names its script when that is not the start's. */
const startAndEnd = (
  scene: string | undefined,
  start: DocumentLocation,
  target: DocumentLocation,
  nameOf: ScriptName,
): RouteLabel => {
  const end =
    target.uri === start.uri
      ? `${lineOf(target)}`
      : `${nameOf(target.uri)} : ${lineOf(target)}`;
  return {
    name: scene ?? nameOf(start.uri),
    lines: `(${lineOf(start)} → ${end})`,
  };
};

/** The route button's label in its two parts: the name, which gives way
 *  when the button is narrow, and the bracket of lines, which stays. */
export interface RouteLabel {
  name: string;
  lines: string;
}

/** The route button's label, `interrogation` and `(4 → 21)`, or nothing
 *  when there is no route to show. */
export const routeLabelParts = (
  state: RouteViewState,
  nameOf: ScriptName,
): RouteLabel | null => {
  if (state.failure) {
    const { scene, start, target } = state.failure;
    if (start && target) {
      return startAndEnd(scene, start, target, nameOf);
    }
    if (target) {
      return { name: nameOf(target.uri), lines: `: ${lineOf(target)}` };
    }
    return null;
  }
  const route = state.route;
  if (!route) {
    return null;
  }
  return startAndEnd(
    route.start.scene,
    route.start.location,
    route.target,
    nameOf,
  );
};

/** The route button's label as one line, `interrogation (4 → 21)`. */
export const routeLabel = (
  state: RouteViewState,
  nameOf: ScriptName,
): string | null => {
  const parts = routeLabelParts(state, nameOf);
  return parts && `${parts.name} ${parts.lines}`;
};

/** The row naming where the run starts. */
export const routeStartText = (route: PreviewRoute, nameOf: ScriptName) => {
  const line = lineOf(route.start.location);
  return route.start.scene
    ? `From the top of scene ${route.start.scene}, line ${line}, with every store at its first value`
    : `From the top of ${nameOf(route.start.location.uri)}, line ${line}, with every store at its first value`;
};

/** The route button's hover: the route in words, and why there is none
 *  when there is none. */
export const routeTitle = (
  state: RouteViewState,
  nameOf: ScriptName,
): string => {
  if (state.failure) {
    return state.failure.message;
  }
  const route = state.route;
  if (!route) {
    return "";
  }
  const target = route.target;
  const to =
    target.uri === route.start.location.uri
      ? `line ${lineOf(target)}`
      : `line ${lineOf(target)} of ${nameOf(target.uri)}`;
  const from = route.start.scene
    ? `the top of scene ${route.start.scene}, line ${lineOf(route.start.location)}`
    : `the top of ${nameOf(route.start.location.uri)}, line ${lineOf(route.start.location)}`;
  const icon = routeIcon(state);
  const how =
    icon === "forced"
      ? " The preview forced a branch the game would not take."
      : icon === "clipped"
        ? " The preview left a loop before the game would."
        : icon === "pinned"
          ? " Your pins steered the route."
          : " The preview runs this line as the game does.";
  return `Route from ${from} to ${to}.${how} Show the route.`;
};

/** `1st`, `2nd`, `3rd`, `4th`, `11th`, `21st`... */
export const ordinal = (n: number): string => {
  const tens = n % 100;
  const suffix =
    tens >= 11 && tens <= 13
      ? "th"
      : n % 10 === 1
        ? "st"
        : n % 10 === 2
          ? "nd"
          : n % 10 === 3
            ? "rd"
            : "th";
  return `${n}${suffix}`;
};

/** An entry's text: what happened there, and nothing else. */
export const decisionText = (decision: PreviewRouteDecision): string => {
  switch (decision.kind) {
    case "pinned":
    case "auto": {
      const meeting =
        decision.meeting && decision.meeting > 1
          ? ` · ${ordinal(decision.meeting)} time`
          : "";
      return `Choice ${decision.text}${meeting}`;
    }
    case "forced":
      return `Condition ${decision.text} forced ${decision.verdict ? "true" : "false"}`;
    case "clipped": {
      const passes = decision.passes ?? 0;
      return `Loop clipped after ${passes.toLocaleString("en-US")} ${passes === 1 ? "pass" : "passes"}`;
    }
  }
};

/** How many of the route's decisions are of each kind. */
export const kindCounts = (
  route: PreviewRoute | undefined,
): Record<RouteKind, number> => {
  const counts: Record<RouteKind, number> = {
    pinned: 0,
    auto: 0,
    forced: 0,
    clipped: 0,
  };
  for (const decision of route?.decisions ?? []) {
    counts[decision.kind] += 1;
  }
  return counts;
};

/** Toggles read from what a host stored, each kind the stored value names
 *  as a boolean, and on otherwise. */
export const routeTogglesFrom = (stored: unknown): RouteToggles => {
  const toggles = { ...DEFAULT_ROUTE_TOGGLES };
  if (stored && typeof stored === "object") {
    for (const kind of ROUTE_KINDS) {
      const value = (stored as Record<string, unknown>)[kind];
      if (typeof value === "boolean") {
        toggles[kind] = value;
      }
    }
  }
  return toggles;
};
