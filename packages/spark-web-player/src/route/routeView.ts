import type {
  PreviewRoute,
  PreviewRouteDecision,
  PreviewRouteOption,
  RoutePin,
  RunMeeting,
} from "@impower/spark-engine/src/game/core/types/PreviewRoute";
import type { DocumentLocation } from "@impower/spark-engine/src/game/core/types/DocumentLocation";

export type RouteKind = "pinned" | "auto" | "forced" | "clipped";

export const ROUTE_KINDS: readonly RouteKind[] = [
  "pinned",
  "auto",
  "forced",
  "clipped",
];

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

export const ROUTE_KIND_MEANINGS: Record<RouteKind, string> = {
  pinned: "Choices you pinned",
  auto: "Choices the preview made where you have no pin",
  forced:
    "Conditions the preview forced to reach the target line; the game would not go this way",
  clipped:
    "Loops the preview left before the game would; the game runs them to the end",
};

export interface RouteFailure {
  message: string;
  scene?: string;
  start?: DocumentLocation;
  target?: DocumentLocation;
}

export interface RouteViewState {
  route?: PreviewRoute;
  failure?: RouteFailure;
  open: boolean;
  toggles: RouteToggles;
  pins: RoutePin[];
  pinNote?: string;
  lastRun?: number;
}

export const PIN_NOT_SAVED = "The pin was not saved.";

export const LAST_RUN_CHANGED =
  "The script has changed where the last run chose, so its choices were not pinned.";

export interface RoutePinChange {
  add?: RoutePin[];
  remove?: RoutePin[];
  removeAll?: boolean;
}

const samePin = (a: RoutePin, b: RoutePin) =>
  a.uri === b.uri && a.line === b.line && a.offer === b.offer;

export const pinOf = (option: PreviewRouteOption): RoutePin => ({
  uri: option.location.uri,
  line: option.location.range.start.line,
  offer: option.offer,
});

export const isPinned = (pins: RoutePin[], option: PreviewRouteOption) =>
  pins.some((pin) => samePin(pin, pinOf(option)));

const pinsAtStop = (pins: RoutePin[], decision: PreviewRouteDecision) =>
  [
    ...(decision.options ?? []).map(pinOf),
    ...(decision.unofferedPins ?? []),
  ].filter((at) => pins.some((pin) => samePin(pin, at)));

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

export const unpinChange = (
  pins: RoutePin[],
  decision: PreviewRouteDecision,
): RoutePinChange => ({ remove: pinsAtStop(pins, decision) });

export const stopIsPinned = (
  pins: RoutePin[],
  decision: PreviewRouteDecision,
): boolean => pinsAtStop(pins, decision).length > 0;

export const lastRunChange = (
  pins: RoutePin[],
  run: RunMeeting[],
): RoutePinChange | null => {
  const add = run
    .map((meeting) => meeting.pin)
    .filter((pin) => !pins.some((at) => samePin(at, pin)));
  const remove = run
    .flatMap((meeting) => meeting.others)
    .filter(
      (other) =>
        pins.some((at) => samePin(at, other)) &&
        !run.some((meeting) => samePin(meeting.pin, other)),
    );
  return add.length > 0 || remove.length > 0 ? { add, remove } : null;
};

export const lastRunText = (count: number): string =>
  `Pin the ${count} ${count === 1 ? "choice" : "choices"} from the last run`;

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

export const unresolvedPinText = (pin: RoutePin, nameOf: ScriptName) =>
  `Pin at line ${pin.line + 1} of ${nameOf(pin.uri)}: no option on this line`;

export type ScriptName = (uri: string) => string;

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

export interface RouteLabel {
  name: string;
  lines: string;
}

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

export const routeLabel = (
  state: RouteViewState,
  nameOf: ScriptName,
): string | null => {
  const parts = routeLabelParts(state, nameOf);
  return parts && `${parts.name} ${parts.lines}`;
};

export const routeStartText = (route: PreviewRoute, nameOf: ScriptName) => {
  const line = lineOf(route.start.location);
  return route.start.scene
    ? `From the top of scene ${route.start.scene}, line ${line}, with every store at its first value`
    : `From the top of ${nameOf(route.start.location.uri)}, line ${line}, with every store at its first value`;
};

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
