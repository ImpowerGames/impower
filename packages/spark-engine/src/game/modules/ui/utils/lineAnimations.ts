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

const KEYFRAME_TIMING = new Set(["offset", "easing", "composite"]);

type PlacedFrame = { offset: number; frame: Record<string, unknown> | null };

const offsetOf = (frame: Record<string, unknown> | undefined): number | undefined => {
  const offset = frame?.["offset"];
  if (typeof offset === "number") {
    return offset;
  }
  if (typeof offset === "string") {
    const value = parseFloat(offset);
    return Number.isFinite(value) ? (offset.trim().endsWith("%") ? value / 100 : value) : undefined;
  }
  return undefined;
};

const placedFrames = (frames: Record<string, unknown>[]): PlacedFrame[] => {
  const offsets = frames.map(offsetOf);
  if (frames.length === 1) {
    offsets[0] ??= 1;
  } else {
    offsets[0] ??= 0;
    offsets[offsets.length - 1] ??= 1;
  }
  for (let i = 1; i < offsets.length - 1; i += 1) {
    if (offsets[i] === undefined) {
      let next = i;
      while (offsets[next] === undefined) {
        next += 1;
      }
      const from = offsets[i - 1]!;
      const to = offsets[next]!;
      for (let k = i; k < next; k += 1) {
        offsets[k] = from + ((to - from) * (k - i + 1)) / (next - i + 1);
      }
    }
  }
  const placed: PlacedFrame[] = frames.map((frame, i) => ({ offset: offsets[i]!, frame }));
  if (placed[0]!.offset > 0) {
    placed.unshift({ offset: 0, frame: null });
  }
  if (placed.at(-1)!.offset < 1) {
    placed.push({ offset: 1, frame: null });
  }
  return placed;
};

const frameAt = (placed: PlacedFrame[], progress: number, latest: boolean): PlacedFrame | undefined => {
  const at = placed.filter((p) => Math.abs(p.offset - progress) < 1e-9);
  return latest ? at.at(-1) : at[0];
};

const playsForward = (direction: string, iteration: number): boolean =>
  direction === "reverse"
    ? false
    : direction === "alternate"
      ? iteration % 2 === 0
      : direction === "alternate-reverse"
        ? iteration % 2 === 1
        : true;

const endsAwayFromStart = (animation: Animation, iterations: number): boolean => {
  const frames: Record<string, unknown>[] = animation.keyframes ?? [];
  if (frames.length === 0 || !(iterations > 0)) {
    return false;
  }
  const placed = placedFrames(frames);
  const direction = animation.timing?.direction ?? "normal";
  const last = Math.ceil(iterations) - 1;
  const part = iterations - last;
  const forwardAtEnd = playsForward(direction, last);
  const forwardAtStart = playsForward(direction, 0);
  const end = frameAt(placed, forwardAtEnd ? part : 1 - part, forwardAtEnd);
  if (!end) {
    return true;
  }
  if (!end.frame) {
    return false;
  }
  const start = frameAt(placed, forwardAtStart ? 0 : 1, !forwardAtStart)!.frame;
  if (!start) {
    return true;
  }
  return Object.keys({ ...start, ...end.frame }).some(
    (property) =>
      !property.startsWith("$") &&
      !KEYFRAME_TIMING.has(property) &&
      JSON.stringify(start[property]) !== JSON.stringify(end.frame![property]),
  );
};

export const namesTransition = (context: AnimationContext | undefined, entry: WithInstruction): boolean =>
  Boolean(context?.transition?.[entry.name]);

export const heldPose = (context: AnimationContext | undefined, entries: readonly WithInstruction[]): WithInstruction[] =>
  entries.flatMap((entry): WithInstruction[] => {
    const animation = namesTransition(context, entry) ? undefined : context?.animation?.[entry.name];
    if (!animation) {
      return [];
    }
    const declared = animation.timing?.iterations ?? 1;
    const iterations = entry.loop ? Infinity : entry.once ? 1 : declared === "infinite" ? Infinity : Number(declared);
    if (iterations === Infinity) {
      return [
        {
          name: entry.name,
          after: 0,
          ...(entry.over !== undefined ? { over: entry.over } : {}),
          ...(entry.ease !== undefined ? { ease: entry.ease } : {}),
          loop: true,
          kept: true,
        },
      ];
    }
    const fill = animation.timing?.fill;
    return (fill === "forwards" || fill === "both") && endsAwayFromStart(animation, iterations)
      ? [{ name: entry.name, after: 0, over: 0, ...(entry.once ? { once: true } : {}), kept: true }]
      : [];
  });

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
  const durationOf = (name: string | undefined) => getTimeValue(context?.animation?.[name ?? ""]?.timing?.duration) ?? 0;
  const longest = Math.max(
    0,
    ...Object.entries(transition)
      .filter(([k, v]) => !k.startsWith("$") && v)
      .map(([, v]: [string, any]) => durationOf(typeof v === "string" ? v : v?.$name)),
  );
  const speed = timing.over != null && timing.over > 0 ? longest / timing.over : 1;
  const armed = transition[arm];
  const name = (typeof armed === "string" ? armed : armed?.$name) || (arm === "on_show" ? "show" : "hide");
  return { name, ...timing, over: durationOf(name) / speed };
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
  const written = withEntries(e);
  const entries = written.filter((entry) => !entry.kept);
  const kept = written.filter((entry) => entry.kept);
  const lineEvent = (name: string): AnimationEvent => ({
    name,
    after: e.after,
    ...beatOffset(e),
    over: e.over,
    ...(e.ease !== undefined ? { ease: e.ease } : {}),
  });
  const showEvents = entries.length ? entries.map((entry) => armEvent(context, entry, "on_show")) : [lineEvent("show")];
  const hideEvents = entries.length ? entries.map((entry) => armEvent(context, entry, "on_hide")) : [lineEvent("hide")];
  const definitions = (events: AnimationEvent[]) => events.flatMap((event) => animationDefinition(context, event, instant) ?? []);
  const armsOf = (entry: WithInstruction): LineAnimation[] =>
    Object.entries(context?.transition?.[entry.name] ?? {}).flatMap(([k, v]: [string, any]) => {
      if (k.startsWith("$") || k.startsWith("on_")) {
        return [];
      }
      const animateWith = typeof v === "string" ? v : v?.$name;
      const animation = animateWith ? animationDefinition(context, { name: animateWith, ...withTiming(entry) }, instant) : undefined;
      return animation ? [{ ...animation, arm: k }] : [];
    });
  const inWrittenOrder = (eventOf: (entry: WithInstruction) => AnimationEvent) =>
    entries.flatMap((entry) => [...definitions([eventOf(entry)]), ...armsOf(entry)]);
  if (pictured) {
    if (e.control === "show") {
      result.enterAnimations = definitions([
        ...showEvents,
        ...kept.map((entry) => armEvent(context, entry, "on_show")),
      ]);
      result.previousHideAnimations = definitions(hideEvents);
    } else if (e.control === "hide") {
      result.exitAnimations = definitions(hideEvents);
    } else if (e.control === "animate" && entries.length > 1) {
      result.targetAnimations.push(...inWrittenOrder((entry) => armEvent(context, entry, "on_show")));
    } else if (e.control === "animate") {
      result.enterAnimations = definitions(showEvents);
    }
    if (e.control !== "animate" || entries.length <= 1) {
      result.targetAnimations.push(...entries.flatMap(armsOf));
    }
  } else if (e.control === "hide") {
    result.targetAnimations.push(
      ...(entries.length ? inWrittenOrder((entry) => armEvent(context, entry, "on_hide")) : definitions(hideEvents)),
    );
  } else if (e.control === "show") {
    result.targetAnimations.push(
      ...(entries.length ? inWrittenOrder((entry) => armEvent(context, entry, "on_show")) : definitions(showEvents)),
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
