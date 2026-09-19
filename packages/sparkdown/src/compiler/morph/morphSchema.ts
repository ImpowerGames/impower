// The author vocabulary of a `morph NAME with … end` block: which fields exist,
// where each one belongs, and the values the enumerated fields accept. The
// compiler's checks, the builtin type and the language server's completion all
// read these lists, so a field or value is added in one place.

export const MORPH_BLENDS = ["morph", "fade", "cut", "scale"] as const;
export const MORPH_FALLBACKS = ["fade", "cut", "scale"] as const;
/**
 * The geometry methods, each named by the motion an artist chooses it for:
 * `match` moves node to node between two drawings with the same nodes in the
 * same order, `bend` bends or straightens the middle of a thin shape with two
 * pointed ends while the ends keep their shape, and `trace` pairs points
 * traced along the outline of any closed shape.
 */
export const MORPH_METHODS = ["match", "bend", "trace"] as const;
export const MORPH_DIRECTIONS = [
  "normal",
  "reverse",
  "alternate",
  "alternate-reverse",
] as const;
export const MORPH_EASING_KEYWORDS = [
  "linear",
  "ease",
  "ease-in",
  "ease-out",
  "ease-in-out",
  "step-start",
  "step-end",
] as const;
export const MORPH_STEP_POSITIONS = [
  "jump-start",
  "jump-end",
  "jump-none",
  "jump-both",
  "start",
  "end",
] as const;

/** Fields a morph's root holds. */
export const MORPH_ROOT_FIELDS = [
  "blend",
  "method",
  "fallback",
  "layers",
  "keyframes",
  "timing",
  "clips",
] as const;

/** Transition-policy fields: at the root, or under a label in `layers:`. */
export const MORPH_POLICY_FIELDS = ["blend", "method", "fallback"] as const;

export const MORPH_TIMING_FIELDS = [
  "duration",
  "delay",
  "easing",
  "iterations",
  "direction",
  "iteration_delay_min",
  "iteration_delay_max",
] as const;

/** 2D layer properties a keyframe container can pose. */
export const MORPH_LAYER_PROPERTIES = [
  "translate",
  "rotate",
  "scale",
  "transform",
  "transform_origin",
  "opacity",
] as const;

/** Fields of one keyframe container (`eyes:` inside a keyframe). */
export const MORPH_CONTAINER_FIELDS = [
  "state",
  ...MORPH_LAYER_PROPERTIES,
] as const;

export const MORPH_CLIP_FIELDS = ["between", "targets"] as const;

/** Keys whose values are literal text rather than numbers or references. */
export const MORPH_LITERAL_KEYS: ReadonlySet<string> = new Set(["state"]);
/** Keys whose `-` items are literal labels. */
export const MORPH_LITERAL_LIST_KEYS: ReadonlySet<string> = new Set(
  MORPH_CLIP_FIELDS,
);

export const MORPH_TIMING_DEFAULTS = {
  duration: 0.25,
  delay: 0,
  easing: "ease-out",
  iterations: 1,
  direction: "normal",
} as const;

/** One-line documentation shown by completion and hover. */
export const MORPH_FIELD_DOCS: Record<string, string> = {
  blend: "How shapes change between poses: `morph` (default), `fade`, `cut` or `scale`.",
  method:
    "How matched shapes morph: `match` (same nodes in the same order), `bend` (a thin shape with two pointed ends bends while its ends keep their shape) or `trace` (any closed shape). Required wherever `blend = morph` applies.",
  fallback:
    "What happens to a shape with no usable morph pair: `fade` (default), `cut` or `scale`.",
  layers: "Per-label overrides of `blend`, `method` and `fallback`, keyed by artwork layer label.",
  keyframes:
    "The poses, as `-` items with an `offset` or as position keys (`from:`, `50%:`, `to:`). Each pose holds containers such as `eyes:` with a `state` and layer properties. As in CSS keyframes, a pose that leaves a group or property out moves between the nearest poses that set it, and a first or last pose that leaves it out uses the image's resting value there.",
  timing: "When and how often the morph plays.",
  clips:
    "Apertures cut from the facing edges of `between` layers and applied to the `targets` layers.",
  duration: "Seconds one play lasts. Default 0.25.",
  delay: "Seconds before the first play. Default 0.",
  easing:
    "The timing curve over a whole play: a CSS name (`ease-out` by default), `cubic-bezier(…)`, `steps(…)` or `linear(…)`.",
  iterations: "How many plays: a whole number, or `infinite`. `0` disables playback. Default 1.",
  direction: "`normal` (default), `reverse`, `alternate` or `alternate-reverse`.",
  iteration_delay_min:
    "Shortest quiet time, in seconds, between the end of one play and the start of the next. Needs `iteration_delay_max`.",
  iteration_delay_max:
    "Longest quiet time, in seconds, between plays. Each gap is drawn uniformly between the two bounds.",
  offset: "Where this pose sits on the play, from 0 to 1.",
  state: "The attribute state this group shows at this pose, such as `closed` or `eyes.closed`.",
  translate: "Moves the layer: `x y`, such as `0 8px`.",
  rotate: "Rotates the layer by an angle, such as `5deg`.",
  scale: "Scales the layer: one factor, or `x y`.",
  transform: "A 2D CSS transform list, such as `skewX(4deg)`.",
  transform_origin: "The point the layer transforms around. Default `center`.",
  opacity: "The layer's opacity, from 0 to 1.",
  between: "The layers whose facing edges form the aperture.",
  targets: "The layers the aperture clips.",
};

const splitArgs = (text: string): string[] =>
  text.split(",").map((part) => part.trim());

const isFiniteNumberText = (text: string): boolean =>
  /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?$/i.test(text);

/**
 * Why `easing` is not a supported timing function, or null when it is. Accepts
 * the CSS easing names and the `cubic-bezier()`, `steps()` and `linear()`
 * functions.
 */
export function easingProblem(easing: string): string | null {
  const text = easing.trim();
  if ((MORPH_EASING_KEYWORDS as readonly string[]).includes(text)) return null;
  const call = /^([a-z-]+)\((.*)\)$/i.exec(text);
  if (!call) {
    return `\`${text}\` is not an easing. Use ${MORPH_EASING_KEYWORDS.map((k) => `\`${k}\``).join(", ")}, \`cubic-bezier(…)\`, \`steps(…)\` or \`linear(…)\`.`;
  }
  const [, fn, body] = call;
  const args = splitArgs(body!);
  if (fn === "cubic-bezier") {
    if (args.length !== 4 || !args.every(isFiniteNumberText)) {
      return "`cubic-bezier()` takes four numbers: `cubic-bezier(x1, y1, x2, y2)`.";
    }
    const [x1, , x2] = args.map(Number);
    if (x1! < 0 || x1! > 1 || x2! < 0 || x2! > 1) {
      return "The x values of `cubic-bezier()` (the first and third numbers) must be between 0 and 1.";
    }
    return null;
  }
  if (fn === "steps") {
    const [count, position, ...rest] = args;
    if (rest.length > 0 || !count || !/^\d+$/.test(count) || Number(count) < 1) {
      return "`steps()` takes a whole number of steps of at least 1 and an optional position: `steps(3)` or `steps(3, jump-start)`.";
    }
    if (
      position !== undefined &&
      !(MORPH_STEP_POSITIONS as readonly string[]).includes(position)
    ) {
      return `\`${position}\` is not a step position. Use ${MORPH_STEP_POSITIONS.map((p) => `\`${p}\``).join(", ")}.`;
    }
    if (position === "jump-none" && Number(count) < 2) {
      return "`steps()` with `jump-none` needs at least 2 steps.";
    }
    return null;
  }
  if (fn === "linear") {
    const stops = args.map((arg) => arg.split(/\s+/));
    const valid =
      stops.length >= 2 &&
      stops.every(
        ([output, ...inputs]) =>
          output !== undefined &&
          isFiniteNumberText(output) &&
          inputs.length <= 2 &&
          inputs.every((input) => /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)%$/.test(input)),
      );
    return valid
      ? null
      : "`linear()` takes at least two stops, each a number optionally followed by one or two percentages: `linear(0, 0.5 25%, 1)`.";
  }
  return `\`${fn}()\` is not an easing function. Use \`cubic-bezier()\`, \`steps()\` or \`linear()\`.`;
}
