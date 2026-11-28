import { LayoutVerb } from "@impower/sparkdown/language/sparkdown.layout-verbs";
import type { ImageInstruction, WithInstruction } from "../../../core/types/Instruction";
import { getTimeValue } from "../../../core/utils/getTimeValue";
import { presenceStyleBlocks } from "../../../core/utils/presenceStyleBlocks";
import type { LineAnimation } from "../classes/messages/WriteImageMessage";
import type { Animation } from "../types/Animation";
import type { Ease } from "../types/Ease";

export interface AnimationContext {
  animation?: Record<string, Animation>;
  transition?: Record<string, any>;
  ease?: Record<string, Ease>;
  style?: Record<string, unknown>;
}

export interface AnimationEvent {
  name: string;
  after?: number;
  afterIsBeatOffset?: true;
  over?: number;
  ease?: string;
  loop?: boolean;
}

export interface LayoutClauses {
  with?: string;
  after?: number;
  afterIsBeatOffset?: true;
  over?: number;
  ease?: string;
  loop?: boolean;
}

export interface PictureLineAnimations {
  targetAnimations: LineAnimation[];
  enterAnimations: Animation[];
  previousHideAnimations: Animation[];
  exitAnimations: Animation[];
}

export const timingFunction = (ease: Ease) => `${ease.function}(${ease.parameters.join(",")})`;

export const beatOffset = (timed: { afterIsBeatOffset?: true }): { afterIsBeatOffset?: true } =>
  timed.afterIsBeatOffset ? { afterIsBeatOffset: true } : {};

export const withEntries = (e: { with?: WithInstruction[] }): WithInstruction[] => {
  const written: unknown = e.with;
  return Array.isArray(written) ? written : typeof written === "string" && written ? [{ name: written }] : [];
};

export const withTiming = (entry: WithInstruction): Omit<AnimationEvent, "name"> => ({
  after: entry.after,
  ...beatOffset(entry),
  over: entry.over,
  ease: entry.ease,
  ...(entry.loop ? { loop: true } : entry.once ? { loop: false } : {}),
});

export const animationDefinition = (
  context: AnimationContext | undefined,
  event: AnimationEvent,
  instant: boolean,
): Animation | undefined => {
  const { name, after, afterIsBeatOffset, over, ease, loop } = event;
  const animation = context?.animation?.[name];
  if (!animation) {
    return undefined;
  }
  const easeDefinition = ease ? context?.ease?.[ease] : null;
  const declaredDelay = getTimeValue(animation.timing?.delay) ?? 0;
  const timing = {
    delay: `${after == null ? declaredDelay : afterIsBeatOffset ? after + declaredDelay : after}s`,
    duration: over != null ? `${over}s` : (animation.timing?.duration ?? "0s"),
    iterations: (loop === true ? "infinite" : loop === false ? 1 : undefined) ?? animation.timing?.iterations ?? 1,
    easing: (easeDefinition != null ? timingFunction(easeDefinition) : null) ?? animation.timing?.easing ?? "ease",
    fill: animation.timing?.fill ?? "none",
    direction: animation.timing?.direction ?? "normal",
  };
  if (instant) {
    timing.delay = "0s";
    timing.duration = "0s";
  }
  return {
    $type: animation.$type,
    $name: animation.$name,
    target: animation.target ?? { $type: "layer", $name: "self" },
    keyframes: animation.keyframes,
    timing,
  } as Animation;
};

export const armEvent = (
  context: AnimationContext | undefined,
  entry: WithInstruction,
  arm: "on_show" | "on_hide",
): AnimationEvent => {
  const timing = withTiming(entry);
  const transition = context?.transition?.[entry.name];
  if (!transition) {
    return { name: entry.name, ...timing };
  }
  const armed = transition[arm];
  const name = (typeof armed === "string" ? armed : armed?.$name) || (arm === "on_show" ? "show" : "hide");
  return { name, ...timing, over: stretchedOver(context, entry, name) ?? animationDuration(context, name) };
};

const animationDuration = (context: AnimationContext | undefined, name: string | undefined): number =>
  getTimeValue(context?.animation?.[name ?? ""]?.timing?.duration) ?? 0;

const stretchedOver = (context: AnimationContext | undefined, entry: WithInstruction, name: string): number | undefined => {
  const transition = context?.transition?.[entry.name];
  if (!transition || entry.over == null) {
    return undefined;
  }
  if (entry.over <= 0) {
    return 0;
  }
  const longest = Math.max(
    0,
    ...Object.entries(transition)
      .filter(([k, v]) => !k.startsWith("$") && v)
      .map(([, v]: [string, any]) => animationDuration(context, typeof v === "string" ? v : v?.$name)),
  );
  return longest > 0 ? (animationDuration(context, name) * entry.over) / longest : entry.over;
};

export const pictureLineAnimations = (
  context: AnimationContext | undefined,
  e: ImageInstruction,
  instant: boolean,
): PictureLineAnimations => {
  const result: PictureLineAnimations = {
    targetAnimations: [],
    enterAnimations: [],
    previousHideAnimations: [],
    exitAnimations: [],
  };
  const assets = e.assets;
  const pictured = Boolean(assets && assets.length > 0);
  if (e.control === "show" && pictured) {
    const reveal = animationDefinition(
      context,
      { name: "show", after: e.after, ...beatOffset(e), over: 0, ...(e.ease !== undefined ? { ease: e.ease } : {}) },
      instant,
    );
    if (reveal) {
      result.targetAnimations.push(reveal);
    }
  }
  const entries = withEntries(e);
  const lineEvent = (name: string): AnimationEvent => ({
    name,
    after: e.after,
    ...beatOffset(e),
    over: e.over,
    ...(e.ease !== undefined ? { ease: e.ease } : {}),
  });
  const using: WithInstruction | undefined = e.using ? lineEvent(e.using) : undefined;
  const ownMotion = (arm: "on_show" | "on_hide"): AnimationEvent[] =>
    using ? [armEvent(context, using, arm)] : [lineEvent(arm === "on_show" ? "show" : "hide")];
  const showEvents = [...ownMotion("on_show"), ...entries.map((entry) => armEvent(context, entry, "on_show"))];
  const hideEvents = [...ownMotion("on_hide"), ...entries.map((entry) => armEvent(context, entry, "on_hide"))];
  const definitions = (events: AnimationEvent[]) => events.flatMap((event) => animationDefinition(context, event, instant) ?? []);
  const armsOf = (entry: WithInstruction): LineAnimation[] =>
    Object.entries(context?.transition?.[entry.name] ?? {}).flatMap(([k, v]: [string, any]) => {
      if (k.startsWith("$") || k.startsWith("on_")) {
        return [];
      }
      const animateWith = typeof v === "string" ? v : v?.$name;
      const over = animateWith ? stretchedOver(context, entry, animateWith) : undefined;
      const animation = animateWith
        ? animationDefinition(context, { name: animateWith, ...withTiming(entry), ...(over != null ? { over } : {}) }, instant)
        : undefined;
      return animation ? [{ ...animation, arm: k }] : [];
    });
  const inWrittenOrder = (eventOf: (entry: WithInstruction) => AnimationEvent) =>
    entries.flatMap((entry) => [...definitions([eventOf(entry)]), ...armsOf(entry)]);
  const usingArms = using ? armsOf(using) : [];
  if (pictured) {
    if (e.control === "show") {
      result.enterAnimations = definitions(showEvents);
      result.previousHideAnimations = definitions(hideEvents);
    } else if (e.control === "hide") {
      result.exitAnimations = definitions(hideEvents);
    } else if (e.control === "animate") {
      result.enterAnimations = definitions(ownMotion("on_show"));
      result.targetAnimations.push(...inWrittenOrder((entry) => armEvent(context, entry, "on_show")));
    }
    result.targetAnimations.push(...usingArms);
    if (e.control !== "animate") {
      result.targetAnimations.push(...entries.flatMap(armsOf));
    }
  } else if (e.control === "hide" || e.control === "show") {
    const arm = e.control === "show" ? "on_show" : "on_hide";
    result.targetAnimations.push(
      ...definitions(ownMotion(arm)),
      ...usingArms,
      ...inWrittenOrder((entry) => armEvent(context, entry, arm)),
    );
  } else if (e.control === "animate") {
    result.targetAnimations.push(...inWrittenOrder((entry) => ({ name: entry.name, ...withTiming(entry) })));
  }
  return result;
};

export const layoutAnimation = (
  context: AnimationContext | undefined,
  direction: "enter" | "exit",
  clauses: LayoutClauses,
  instant: boolean,
): Animation | undefined => {
  const withName = clauses.with || "";
  const transition = context?.transition?.[withName];
  const fallback = direction === "enter" ? "show" : "hide";
  const arm = transition ? (direction === "enter" ? transition.on_show : transition.on_hide) : undefined;
  const name = transition ? (typeof arm === "string" ? arm : arm?.$name) || fallback : withName || fallback;
  return animationDefinition(
    context,
    {
      name,
      after: clauses.after,
      ...beatOffset(clauses),
      over: clauses.over,
      ...(clauses.ease !== undefined ? { ease: clauses.ease } : {}),
      ...(clauses.loop !== undefined ? { loop: clauses.loop } : {}),
    },
    instant,
  );
};

export const layoutAnimations = (
  context: AnimationContext | undefined,
  direction: "enter" | "exit",
  clauses: LayoutClauses[] | undefined,
  instant: boolean,
): Animation[] =>
  (clauses?.length ? clauses : [{}]).flatMap((c) => {
    const animation = layoutAnimation(context, direction, c, instant);
    return animation ? [animation] : [];
  });

export const layoutArrivesByStyle = (
  context: AnimationContext | undefined,
  direction: "enter" | "exit",
  clauses: LayoutClauses[] | undefined,
): boolean => !clauses?.some((c) => c.with) && presenceStyleBlocks(context?.style)[direction === "enter" ? "show" : "hide"];

export const pictureLineEnd = (context: AnimationContext | undefined, e: ImageInstruction): number => {
  const plays = pictureLineAnimations(context, e, false);
  return animationsEnd([
    ...plays.targetAnimations,
    ...plays.enterAnimations,
    ...plays.previousHideAnimations,
    ...plays.exitAnimations,
  ]);
};

export const screenLineEnd = (
  context: AnimationContext | undefined,
  control: string,
  clauses: LayoutClauses[] | undefined,
): number => {
  const directions: ("enter" | "exit")[] =
    control === LayoutVerb.open
      ? ["enter"]
      : control === LayoutVerb.close
        ? ["exit"]
        : control === LayoutVerb.navigate
          ? ["exit", "enter"]
          : [];
  return animationsEnd(
    directions.flatMap((direction) =>
      layoutArrivesByStyle(context, direction, clauses) ? [] : layoutAnimations(context, direction, clauses, false),
    ),
  );
};

export const animationsEnd = (animations: readonly Animation[]): number =>
  Math.max(
    0,
    ...animations.map(
      (animation) => (getTimeValue(animation.timing?.delay) ?? 0) + (getTimeValue(animation.timing?.duration) ?? 0),
    ),
  );
