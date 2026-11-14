export const MORPH_BLENDS = ["morph", "fade", "cut", "scale"] as const;
export const MORPH_FALLBACKS = ["fade", "cut", "scale"] as const;
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

export const MORPH_ROOT_FIELDS = [
  "blend",
  "method",
  "fallback",
  "depth",
  "spread",
  "layers",
  "keyframes",
  "timing",
  "clips",
  "paints",
  "when",
  "unless",
  "rest",
  "default",
] as const;

export const MORPH_OWN_FIELDS: ReadonlySet<string> = new Set(["default"]);

export function withoutMorphOwnFields<T>(struct: T): T {
  if (!struct || typeof struct !== "object" || Array.isArray(struct)) return struct;
  if (![...MORPH_OWN_FIELDS].some((field) => Object.hasOwn(struct, field))) return struct;
  const result = { ...struct } as Record<string, unknown>;
  for (const field of MORPH_OWN_FIELDS) delete result[field];
  return result as T;
}

export const MORPH_DEFAULT_VALUES = ["true", "false"] as const;

export const MORPH_CLAUSE_DOC =
  "Picks the speech morph this directive plays, such as `morph talk_gritted`, among the speech morphs that play on its images and drive the same group; `morph none` plays no speech morph, so the directive's and the art's choices show in those groups. Without the clause, the one marked `default = true` plays, or the only one that plays there. The pick applies to every image in the directive the morph plays on, and lasts until the next directive shows an image on that layer.";

export const MORPH_CONDITION_FIELDS = ["when", "unless"] as const;

export const MORPH_POLICY_FIELDS = ["blend", "method", "fallback", "depth", "spread"] as const;

export const MORPH_LAYER_FIELDS = ["partner"] as const;

export const MORPH_DEPTH_REST = "rest";

export function parseMorphDepth(
  value: unknown,
): typeof MORPH_DEPTH_REST | { group: string; state: string } | undefined {
  if (value === MORPH_DEPTH_REST) return MORPH_DEPTH_REST;
  return parseMorphQualifiedState(value);
}

export function parseMorphPartner(value: unknown): string[] | undefined {
  const list = typeof value === "string" ? [value] : Array.isArray(value) ? value : [];
  return list.length > 0 && list.every((label) => typeof label === "string" && label.trim() !== "") ? (list as string[]) : undefined;
}

export function parseMorphQualifiedState(value: unknown): { group: string; state: string } | undefined {
  if (typeof value !== "string") return undefined;
  const match = /^([^.\s]+)\.(\S+)$/.exec(value);
  return match ? { group: match[1]!, state: match[2]! } : undefined;
}

export function parseMorphSpan(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 && value <= 1 ? value : undefined;
  if (typeof value !== "string") return undefined;
  const match = /^(\d+(?:\.\d+)?|\.\d+)%$/.exec(value.trim());
  if (!match) return undefined;
  const percent = Number(match[1]);
  return percent <= 100 ? percent / 100 : undefined;
}

export const MORPH_TRIGGERS = ["appear", "speech"] as const;

export const MORPH_SPEECH_EXCLUDED_TIMING = {
  delay: "speech decides when its plays start",
  iterations: "speech decides how many plays there are",
} as const;

export const MORPH_SYNCS = ["none", "beep"] as const;

export const MORPH_BEEP_EXCLUDED_TIMING = {
  iteration_delay_min: "its character's beeps decide when its plays start",
  iteration_delay_max: "its character's beeps decide when its plays start",
} as const;

export const MORPH_TIMING_FIELDS = [
  "trigger",
  "sync",
  "duration",
  "delay",
  "easing",
  "iterations",
  "direction",
  "iteration_delay_min",
  "iteration_delay_max",
] as const;

export const MORPH_LAYER_PROPERTIES = [
  "translate",
  "rotate",
  "scale",
  "transform",
  "transform_origin",
  "opacity",
] as const;

export const MORPH_CONTAINER_FIELDS = [
  "state",
  ...MORPH_LAYER_PROPERTIES,
] as const;

export const MORPH_CLIP_LIST_FIELDS = ["between", "targets"] as const;

export const MORPH_CLIP_FIELDS = [...MORPH_CLIP_LIST_FIELDS, "spread"] as const;

export const MORPH_CLIP_SPREAD_DEFAULT = 1;

export const MORPH_SPREAD_PROBLEM = "`spread` is a length in `px` or `0`, such as `spread = 1px` or `spread = -0.5px`.";

export function parseMorphSpread(value: unknown): number | undefined {
  if (value === 0) return 0;
  if (typeof value !== "string") return undefined;
  const match = /^([-+]?(?:\d+(?:\.\d+)?|\.\d+)(?:e[-+]?\d+)?)px$/i.exec(value.trim());
  const pixels = match ? Number(match[1]) : NaN;
  return Number.isFinite(pixels) ? pixels || 0 : undefined;
}

export const MORPH_PAINT_FIELDS = ["targets", "state", "when", "fill", "stroke", "opacity", "span"] as const;

export const MORPH_PAINT_SPAN_DEFAULT = 1;

export const MORPH_LITERAL_KEYS: ReadonlySet<string> = new Set(["state", "depth", "when", "unless", "rest", "fill", "stroke", "partner"]);
export const MORPH_LITERAL_LIST_KEYS: ReadonlySet<string> = new Set([
  ...MORPH_CLIP_LIST_FIELDS,
  ...MORPH_LAYER_FIELDS,
  ...MORPH_CONDITION_FIELDS,
]);

export function parseMorphConditions(value: unknown): { group: string; state: string }[] | undefined {
  const list = typeof value === "string" ? [value] : Array.isArray(value) ? value : undefined;
  if (!list || list.length === 0) return undefined;
  const states = list.map(parseMorphQualifiedState);
  return states.every((state) => state !== undefined) ? (states as { group: string; state: string }[]) : undefined;
}

export const MORPH_TIMING_DEFAULTS = {
  trigger: "appear",
  duration: 0.25,
  delay: 0,
  easing: "ease-out",
  iterations: 1,
  direction: "normal",
} as const;

export const MORPH_FIELD_DOCS: Record<string, string> = {
  blend: "How shapes change between poses: `morph` (default), `fade`, `cut` or `scale`.",
  method:
    "How matched shapes morph: `match` (same nodes in the same order), `bend` (a thin shape with two pointed ends bends while its ends keep their shape) or `trace` (any closed shape). Required wherever `blend = morph` applies.",
  fallback:
    "What happens to a shape with no usable morph pair: `fade` (default), `cut` or `scale`.",
  depth:
    "The pose whose stacking a moving shape keeps between keyframes: `rest` (default), the pose the still image shows, or a state the keyframes name, written with its group, such as `eyes.closed`. Each moving shape is drawn where its label's drawing sits in that pose; a shape that pose does not draw keeps its place in the rest pose.",
  spread:
    "Grows (positive) or shrinks (negative) the outline of drawings in screen pixels while they are between poses or carried to a partner's pose, such as `-1px`, so an edge that lands on another drawing's outline hides under it. Fills only. A drawing shrinks only when it is a single contour that does not overlap itself; split a drawing of several contours into one layer per contour. The overlap check is exact to a ten-thousandth of the drawing's size: an overlap narrower than that counts as touching, and shrinking cuts along it as along touching edges. Default `0`.",
  layers: "Per-label overrides of `blend`, `method`, `fallback`, `depth` and `spread`, and each label's `partner`, keyed by artwork layer label.",
  partner:
    "The labels whose drawing this label's drawings take in a pose that draws none of them: one label, such as `eyelash-left`, or a list in priority order, such as `{ eyeball-shadow-left; eyelash-left }`. The first listed label the pose draws decides, and the label's own name in the list pairs by name at that rank. The drawing moves into the shape of that label's drawing nearest it, keeping its own paint and its place in paint order, and stays in that shape while the pose holds.",
  keyframes:
    "The poses, as `{ … }` entries with an `offset` or as positions (`from { … }`, `50% { … }`, `to { … }`). Each pose holds containers such as `eyes { … }` with a `state` and layer properties. Every group the morph drives needs its `state` in the first pose. As in CSS keyframes, a pose that leaves a group or property out moves between the nearest poses that set it; a last pose that leaves a group out holds the morph's rest there, and a first or last pose that leaves a layer property out uses its resting value (no movement, opacity 1). Each group rests in the state `rest` gives it, or else in the state of the last pose that names it.",
  timing: "When and how often the morph plays.",
  clips:
    "Apertures cut from the facing edges of `between` layers and applied to the `targets` layers.",
  trigger:
    "What starts the morph: `appear` (default) plays it on its own schedule from the moment its portrait appears; `speech` marks it as a speech morph, which never plays on its own schedule: in the preview, in play and in its still it shows its rest. A speech morph takes no `delay` or `iterations`.",
  sync:
    "When a speech morph's plays start: `none` (default) plays it again and again while its character speaks; `beep` starts a play on each of its character's voice beeps that finds no play in progress, so a beep that arrives during a play is skipped. A line spoken by a clip on the `voice` channel has no beeps, and its plays follow one another. Only a `trigger = speech` morph takes it. A morph with `sync = beep` takes no `iteration_delay_min` or `iteration_delay_max`.",
  duration: "Seconds one play lasts. Default 0.25.",
  delay: "Seconds before the first play. Default 0. Not allowed with `trigger = speech`.",
  easing:
    "The timing curve over a whole play: a CSS name (`ease-out` by default), `cubic-bezier(…)`, `steps(…)` or `linear(…)`.",
  iterations: "How many plays: a whole number, or `infinite`. `0` disables playback. Default 1. Not allowed with `trigger = speech`.",
  direction: "`normal` (default), `reverse`, `alternate` or `alternate-reverse`.",
  iteration_delay_min:
    "Shortest quiet time, in seconds, between the end of one play and the start of the next. Needs `iteration_delay_max`. Not allowed with `sync = beep`.",
  iteration_delay_max:
    "Longest quiet time, in seconds, between plays. Each gap is drawn uniformly between the two bounds. Not allowed with `sync = beep`.",
  offset: "Where this pose sits on the play, from 0 to 1.",
  state: "The attribute state this group shows at this pose, such as `closed` or `eyes.closed`.",
  translate: "Moves the layer by `x y`: lengths in `px`, the artwork's own units, or percentages of the layer's own box, such as `0 8px`. Default `0`.",
  rotate: "Rotates the layer about `transform_origin` by an angle, such as `5deg`. Default `0deg`.",
  scale: "Scales the layer about `transform_origin`: one factor, or `x y`, such as `1.1`. Default `1`.",
  transform: "A list of 2D CSS transform functions, applied after `translate`, `rotate` and `scale`, such as `skewX(4deg) translate(0, -1px)`. Default `none`.",
  transform_origin: "The point the layer rotates and scales around, such as `left top` or `50% 100%` of its own box. Default `center`.",
  opacity: "The layer's opacity, from 0 to 1 or a percentage. Default `1`.",
  between: "The layer labels this aperture accepts as edges, such as `eyelash-right`, `eyelash-top-right` and `eyelash-bottom-right`. An image may draw any of them; the ones it draws must form the aperture.",
  targets: "The layers the aperture clips.",
  "clips.spread":
    "How far this clip's opening reaches past its outline, in screen pixels, in the still image and between poses, never past the edges drawn above its targets. Default `1px`; `0` gives no reach; a negative value shrinks the opening inside its edges, which leaves a ring of whatever lies under the targets.",
  paints:
    "Colours and opacities that layers take at one pose, as `{ … }` entries with `targets`, `state`, an optional `when`, at least one of `fill`, `stroke` and `opacity`, and an optional `span`: `{ targets { eyelash-left }; state = eyes.closed; when = mask.on; fill = #c9c9c9; span = 40% }`. Where two entries recolour one drawing, the later wins.",
  "paints.targets": "The layer labels whose drawings this entry paints, such as `eyelash-left`.",
  "paints.state":
    "The pose the colour belongs to, written with its group, such as `eyes.closed`: a state the keyframes name, other than the one the morph starts from. The colour shows while the pose is held and moves in over the neighbouring segments.",
  "paints.when": "Applies the entry only in variants that draw a layer needing this state, written with its group, such as `mask.on`: a state of a group the morph does not drive. Without it the entry applies wherever the morph plays.",
  when: "Plays the morph only on a look where every listed state is active, each written with its group: one state, such as `when = mouth.teeth`, or a block of several, such as `when { mouth.teeth; eyes.open }`. A state is active when the directive or a named look chooses it, or failing that the art's `:default` does, in any visible folder that draws the group. A look it keeps out is not reported. A child morph's own `when` replaces its parent's.",
  unless: "Keeps the morph off a look where any listed state is active, each written with its group: one state, such as `unless = eyes.closed`, or a block of several, such as `unless { eyes.closed; mask.on }`. A state is active when the directive or a named look chooses it, or failing that the art's `:default` does, in any visible folder that draws the group. A look it keeps out is not reported. A child morph's own `unless` replaces its parent's.",
  default:
    "`true` marks the speech morph that plays where several speech morphs play on a look and drive the same group and the directive picks none with a `morph` clause; `false` (default) leaves it unmarked. A speech morph that is the only one playing there needs no mark. Only a `trigger = speech` morph takes it, and a child morph does not inherit it through `as`.",
  rest: "The pose the morph holds its groups in wherever it plays and is not moving them: a block of group containers with a `state` each, written like a keyframe's, such as `rest { mouth { state = teeth } }`. A group `rest` leaves out rests in the state of the last keyframe that names it. Layer movement fields do not belong here: a moved layer rests where it is drawn.",
  fill: "The fill colour the drawings take at the pose: hex, `rgb()`, `rgba()`, `hsl()`, `hsla()` or a named colour.",
  stroke: "The stroke colour the drawings take at the pose: hex, `rgb()`, `rgba()`, `hsl()`, `hsla()` or a named colour.",
  "paints.opacity":
    "The opacity the drawings take at the pose, in place of their own: a number from 0 to 1 or a percentage from `0%` to `100%`, such as `opacity = 0`. A drawing fading in or out at the pose fades from this value.",
  span: "How much of each segment next to the pose the colour change takes: a percentage from `0%` to `100%`, or a number from 0 to 1. Default `100%`; `0%` changes the colour only where the pose's own drawings show.",
};

const splitArgs = (text: string): string[] =>
  text.split(",").map((part) => part.trim());

const isFiniteNumberText = (text: string): boolean =>
  /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?$/i.test(text);

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
