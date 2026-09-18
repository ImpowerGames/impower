import type {
  SourceSpan,
  StructSource,
} from "../lower/lowerers/lowerStructBodyTyped";
import {
  MORPH_BLENDS,
  MORPH_CLIP_FIELDS,
  MORPH_CONTAINER_FIELDS,
  MORPH_DIRECTIONS,
  MORPH_FALLBACKS,
  MORPH_LAYER_PROPERTIES,
  MORPH_METHODS,
  MORPH_POLICY_FIELDS,
  MORPH_ROOT_FIELDS,
  MORPH_TIMING_FIELDS,
  easingProblem,
} from "./morphSchema";
import type { MorphBody, MorphIssue } from "./readMorphBody";

type Span = { from: number; to: number };
type Where = "root" | "timing" | "layer" | "keyframe" | "container" | "clip";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value != null && typeof value === "object" && !Array.isArray(value);

const has = (list: readonly string[], value: unknown): boolean =>
  typeof value === "string" && list.includes(value);

const quoteList = (list: readonly string[]): string =>
  list.length === 1
    ? `\`${list[0]}\``
    : `${list.slice(0, -1).map((v) => `\`${v}\``).join(", ")} or \`${list.at(-1)}\``;

const describeValue = (value: unknown): string =>
  typeof value === "string" ? `\`${value}\`` : `\`${JSON.stringify(value)}\``;

// Where a field that is written in the wrong place belongs.
const HOME: Record<string, string> = {};
for (const f of MORPH_TIMING_FIELDS) HOME[f] = "in `timing:`";
for (const f of MORPH_POLICY_FIELDS)
  HOME[f] = "at the morph root or under a label in `layers:`";
for (const f of MORPH_CONTAINER_FIELDS)
  HOME[f] = "in a keyframe container such as `eyes:`";
for (const f of MORPH_CLIP_FIELDS) HOME[f] = "in a `clips:` entry";
for (const f of ["keyframes", "layers", "clips"]) HOME[f] = "at the morph root";
HOME["timing"] = "at the morph root";
HOME["offset"] = "directly in a keyframe";

const ALLOWED: Record<Where, readonly string[]> = {
  root: MORPH_ROOT_FIELDS,
  timing: MORPH_TIMING_FIELDS,
  layer: MORPH_POLICY_FIELDS,
  keyframe: ["offset"],
  container: MORPH_CONTAINER_FIELDS,
  clip: MORPH_CLIP_FIELDS,
};

// A layer property value's space-separated components, ignoring spaces inside
// parentheses (`calc(1px + 2px) 3px` is two components).
function components(value: unknown): string[] {
  if (typeof value === "number") return [String(value)];
  if (typeof value !== "string") return [];
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of value.trim()) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (/\s/.test(ch) && depth === 0) {
      if (current) parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current) parts.push(current);
  return parts;
}

const THREE_D_FUNCTION_RE =
  /\b(?:matrix3d|translate3d|translateZ|scale3d|scaleZ|rotate3d|rotateX|rotateY|perspective)\s*\(/i;

/** Why a layer property value is unsupported, or null. */
function layerPropertyProblem(key: string, value: unknown): string | null {
  if (key === "opacity") {
    if (typeof value === "number") {
      return value >= 0 && value <= 1
        ? null
        : "`opacity` must be between 0 and 1.";
    }
    const percent =
      typeof value === "string" ? /^(\d+(?:\.\d+)?)%$/.exec(value.trim()) : null;
    if (percent && Number(percent[1]) <= 100) return null;
    return "`opacity` is a number from 0 to 1, or a percentage.";
  }
  if (typeof value !== "string" && typeof value !== "number") {
    return `\`${key}\` takes a value such as ${key === "rotate" ? "`5deg`" : "`0 8px`"}, not a container.`;
  }
  const parts = components(value);
  if (parts.length === 0) return `\`${key}\` needs a value.`;
  if (key === "transform") {
    return THREE_D_FUNCTION_RE.test(String(value))
      ? "3D transforms are not supported. Use 2D functions such as `translate()`, `rotate()`, `scale()`, `skew()` or `matrix()`."
      : null;
  }
  if (key === "rotate") {
    return parts.length === 1
      ? null
      : "Only 2D rotation is supported: write one angle, such as `5deg`.";
  }
  const limit = 2;
  return parts.length <= limit
    ? null
    : `Only 2D \`${key}\` is supported: write at most two values (\`x y\`).`;
}

export interface MorphDeclaration {
  /** The morph's name node, where whole-declaration problems are reported. */
  name: Span;
  /** The morph block, used when the name is missing. */
  block: Span;
  /** The `with` keyword, or null when the author left it out. */
  withKeyword: Span | null;
  /** The body as written in this declaration. */
  own: MorphBody;
  /** The declaration after `$default` and every `as PARENT` are merged in. */
  effective: Record<string, unknown>;
}

/**
 * Check a morph declaration: the body as written, then the concrete morph
 * after inheritance. Issues about written text are placed on that text; a
 * problem that only exists after inheritance (a required `method` that nothing
 * supplies) is placed on the morph's name.
 */
export function validateMorphDeclaration(decl: MorphDeclaration): MorphIssue[] {
  const issues: MorphIssue[] = [...decl.own.issues];
  const { sources } = decl.own;
  const push = (
    span: Span | undefined | null,
    message: string,
    severity: MorphIssue["severity"] = "error",
  ) => {
    const at = span ?? decl.name;
    issues.push({ from: at.from, to: at.to, message, severity });
  };
  const src = (obj: unknown): StructSource | undefined =>
    obj && typeof obj === "object" ? sources.get(obj) : undefined;
  const keySpan = (obj: unknown, key: string): SourceSpan | undefined =>
    src(obj)?.keys.get(key) ?? src(obj)?.lines.get(key);
  const valueSpan = (obj: unknown, key: string): SourceSpan | undefined =>
    src(obj)?.values.get(key) ?? src(obj)?.lines.get(key);
  const lineSpan = (obj: unknown): SourceSpan | undefined => src(obj)?.line;

  if (!decl.withKeyword) {
    push(
      decl.name,
      "Expected `with` after the morph's name: `morph NAME with … end`.",
    );
  }

  // Report fields that do not belong where they are written.
  const checkFields = (
    obj: Record<string, unknown>,
    where: Where,
    ignore: (key: string) => boolean = () => false,
  ) => {
    for (const key of Object.keys(obj)) {
      if (ALLOWED[where].includes(key) || ignore(key)) continue;
      const span = keySpan(obj, key);
      if (key === "option" && where === "container") {
        push(span, "Use `state` to choose an attribute state: `state = closed`.");
      } else if (HOME[key]) {
        push(span, `\`${key}\` belongs ${HOME[key]}.`);
      } else {
        push(span, `Unknown morph field \`${key}\`.`);
      }
    }
  };

  const checkPolicy = (obj: Record<string, unknown>) => {
    const vocab: Record<string, readonly string[]> = {
      blend: MORPH_BLENDS,
      method: MORPH_METHODS,
      fallback: MORPH_FALLBACKS,
    };
    for (const field of MORPH_POLICY_FIELDS) {
      if (!(field in obj)) continue;
      const value = obj[field];
      if (!has(vocab[field]!, value)) {
        push(
          valueSpan(obj, field),
          `${describeValue(value)} is not a \`${field}\`. Use ${quoteList(vocab[field]!)}.`,
        );
      }
    }
  };

  const own = decl.own.struct;
  checkFields(own, "root");
  checkPolicy(own);

  // layers: label → policy overrides.
  const layers = own["layers"];
  if (layers !== undefined) {
    if (!isRecord(layers)) {
      push(
        valueSpan(own, "layers"),
        "`layers` holds labels, each with its own `blend`, `method` or `fallback`: `layers:` then `creases:` then `fallback = scale`.",
      );
    } else {
      for (const [label, policy] of Object.entries(layers)) {
        if (!isRecord(policy)) {
          push(
            src(layers)?.lines.get(label),
            `\`${label}\` under \`layers:\` is a label: write \`${label}:\` and put its \`blend\`, \`method\` or \`fallback\` beneath it.`,
          );
          continue;
        }
        checkFields(policy, "layer");
        checkPolicy(policy);
      }
    }
  }

  // timing
  const timing = own["timing"];
  if (timing !== undefined) {
    if (!isRecord(timing)) {
      push(valueSpan(own, "timing"), "`timing` is a container: `timing:` with fields such as `duration = 0.25` beneath it.");
    } else {
      checkFields(timing, "timing");
      checkTiming(timing, (field, message) =>
        push(valueSpan(timing, field), message),
      );
    }
  }

  // keyframes
  const keyframes = own["keyframes"];
  if (keyframes !== undefined) {
    if (!Array.isArray(keyframes)) {
      push(
        keySpan(own, "keyframes"),
        isRecord(keyframes)
          ? "Write each keyframe as a position key (`from:`, `50%:`, `to:`) or as a `-` item with an `offset`."
          : "`keyframes` is a list of poses: `keyframes:` then position keys (`from:`, `50%:`, `to:`) or `-` items.",
      );
    } else {
      let previous: { offset: number; span?: SourceSpan } | null = null;
      keyframes.forEach((keyframe, index) => {
        const itemLine = src(keyframes)?.items[index];
        if (!isRecord(keyframe)) {
          push(
            itemLine,
            "A keyframe is a pose, not a single value: write containers such as `eyes:` with `state = closed` beneath the keyframe.",
          );
          return;
        }
        if ("offset" in keyframe) {
          const offset = keyframe["offset"];
          const span = valueSpan(keyframe, "offset");
          if (typeof offset !== "number" || !Number.isFinite(offset)) {
            push(span, "A keyframe `offset` is a number from 0 to 1.");
          } else if (offset < 0 || offset > 1) {
            push(span, `Keyframe offset ${offset} must be between 0 and 1.`);
          } else {
            if (previous && offset < previous.offset) {
              push(
                span,
                `Keyframe offsets must not decrease: ${offset} comes after ${previous.offset}.`,
              );
            }
            previous = { offset, span };
          }
        }
        let poses = 0;
        for (const [key, container] of Object.entries(keyframe)) {
          if (key === "offset") continue;
          if (!isRecord(container)) {
            const line = src(keyframe)?.lines.get(key);
            if (HOME[key] && !(MORPH_CONTAINER_FIELDS as readonly string[]).includes(key)) {
              push(keySpan(keyframe, key), `\`${key}\` belongs ${HOME[key]}.`);
            } else if (
              (MORPH_CONTAINER_FIELDS as readonly string[]).includes(key)
            ) {
              push(
                keySpan(keyframe, key),
                `\`${key}\` belongs in a container naming the group or layer it poses: \`eyes:\` then \`${key} = …\`.`,
              );
            } else {
              push(
                line,
                `\`${key} = …\` is not a pose. Write \`${key}:\` and put \`state = …\` or a layer property beneath it.`,
              );
            }
            continue;
          }
          poses += 1;
          checkFields(container, "container");
          const containerLine = lineSpan(container) ?? keySpan(keyframe, key);
          const hasState = "state" in container;
          const hasProperty = MORPH_LAYER_PROPERTIES.some((p) => p in container);
          if (!hasState && !hasProperty) {
            push(
              containerLine,
              `\`${key}:\` poses nothing: add \`state = …\` or a layer property such as \`translate = 0 8px\`.`,
            );
          }
          if (hasState) {
            const state = container["state"];
            if (typeof state !== "string" || state.trim() === "") {
              push(
                valueSpan(container, "state") ?? containerLine,
                "`state` names an attribute state, such as `closed` or `eyes.closed`.",
              );
            }
          }
          for (const property of MORPH_LAYER_PROPERTIES) {
            if (!(property in container)) continue;
            const problem = layerPropertyProblem(property, container[property]);
            if (problem) push(valueSpan(container, property), problem);
          }
        }
        if (poses === 0) {
          push(
            itemLine ?? lineSpan(keyframe),
            "This keyframe poses nothing: add a container such as `eyes:` with `state = …` beneath it.",
          );
        }
      });
    }
  }

  // clips
  const clips = own["clips"];
  if (clips !== undefined) {
    if (!Array.isArray(clips)) {
      push(
        keySpan(own, "clips"),
        "`clips` is a list: each `-` entry has `between:` and `targets:` label lists.",
      );
    } else {
      clips.forEach((clip, index) => {
        const itemLine = src(clips)?.items[index];
        if (!isRecord(clip)) {
          push(itemLine, "A clip entry needs `between:` and `targets:` label lists beneath its `-`.");
          return;
        }
        checkFields(clip, "clip");
        const lists: Record<string, string[]> = {};
        for (const field of MORPH_CLIP_FIELDS) {
          const list = clip[field];
          if (list === undefined) {
            push(itemLine ?? lineSpan(clip), `This clip entry needs \`${field}:\` with at least one layer label.`);
            continue;
          }
          if (!Array.isArray(list) || list.length === 0) {
            push(keySpan(clip, field), `\`${field}\` is a list of layer labels: \`${field}:\` then \`- eyelash-left\`.`);
            continue;
          }
          lists[field] = [];
          list.forEach((label, i) => {
            if (typeof label !== "string" || label.trim() === "") {
              push(src(list)?.items[i], "A clip list item is a layer label, such as `eyelash-left`.");
            } else {
              lists[field]!.push(label);
            }
          });
        }
        const between = new Set(lists["between"] ?? []);
        const targets = clip["targets"];
        (lists["targets"] ?? []).forEach((label, i) => {
          if (between.has(label)) {
            push(
              Array.isArray(targets) ? src(targets)?.items[i] : undefined,
              `\`${label}\` forms this aperture, so the aperture cannot also clip it. Remove it from \`targets\` or from \`between\`.`,
            );
          }
        });
      });
    }
  }

  // The concrete morph after inheritance.
  const effective = decl.effective;
  const effectiveKeyframes = effective["keyframes"];
  const poseCount = Array.isArray(effectiveKeyframes)
    ? effectiveKeyframes.length
    : 0;
  if (poseCount < 2) {
    push(
      keySpan(own, "keyframes") ?? decl.name,
      "A morph needs at least two keyframes to move between.",
    );
  }
  const rootBlend = effective["blend"] ?? "morph";
  const rootMethod = effective["method"];
  const methodHint = `Choose ${quoteList(MORPH_METHODS)}.`;
  if (rootBlend === "morph" && rootMethod === undefined) {
    push(
      decl.name,
      `\`method\` is required when \`blend = morph\`. ${methodHint}`,
    );
  }
  const effectiveLayers = effective["layers"];
  if (isRecord(effectiveLayers) && rootMethod === undefined) {
    for (const [label, policy] of Object.entries(effectiveLayers)) {
      if (!isRecord(policy)) continue;
      const blend = policy["blend"] ?? rootBlend;
      if (blend === "morph" && policy["method"] === undefined && rootBlend !== "morph") {
        const ownLayers = own["layers"];
        push(
          (isRecord(ownLayers) && keySpan(ownLayers, label)) || decl.name,
          `\`${label}\` morphs, so it needs a \`method\`. ${methodHint}`,
        );
      }
    }
  }
  const effectiveTiming = effective["timing"];
  if (isRecord(effectiveTiming)) {
    const min = effectiveTiming["iteration_delay_min"];
    const max = effectiveTiming["iteration_delay_max"];
    const ownTiming = isRecord(timing) ? timing : undefined;
    const spanOf = (field: string) =>
      (ownTiming && keySpan(ownTiming, field)) || decl.name;
    if ((min === undefined) !== (max === undefined)) {
      const missing = min === undefined ? "iteration_delay_min" : "iteration_delay_max";
      const present = min === undefined ? "iteration_delay_max" : "iteration_delay_min";
      push(
        spanOf(present),
        `\`${present}\` needs \`${missing}\`: the quiet time between plays is drawn between the two.`,
      );
    } else if (
      typeof min === "number" &&
      typeof max === "number" &&
      Number.isFinite(min) &&
      Number.isFinite(max) &&
      max < min
    ) {
      push(
        spanOf("iteration_delay_max"),
        `\`iteration_delay_max\` (${max}) must be at least \`iteration_delay_min\` (${min}).`,
      );
    }
  }
  return issues;
}

/** Check the timing values written in one `timing:` container. */
function checkTiming(
  timing: Record<string, unknown>,
  report: (field: string, message: string) => void,
) {
  const seconds = (field: string, value: unknown, positive: boolean) => {
    if (typeof value === "string") {
      report(
        field,
        `Timing values are numbers of seconds: write \`${field} = ${value.replace(/m?s$/, "")}\`${/ms$/.test(value) ? " (in seconds)" : ""}.`,
      );
      return;
    }
    if (typeof value !== "number" || !Number.isFinite(value)) {
      report(field, `\`${field}\` is a number of seconds.`);
      return;
    }
    if (positive ? value <= 0 : value < 0) {
      report(
        field,
        positive
          ? `\`${field}\` must be greater than 0.`
          : `\`${field}\` must not be negative.`,
      );
    }
  };
  for (const [field, value] of Object.entries(timing)) {
    switch (field) {
      case "duration":
        seconds(field, value, true);
        break;
      case "delay":
      case "iteration_delay_min":
      case "iteration_delay_max":
        seconds(field, value, false);
        break;
      case "iterations":
        if (value === "infinite") break;
        if (
          typeof value !== "number" ||
          !Number.isInteger(value) ||
          value < 0
        ) {
          report(
            field,
            "`iterations` is a whole number of plays (0 or more), or `infinite`.",
          );
        }
        break;
      case "direction":
        if (!has(MORPH_DIRECTIONS, value)) {
          report(
            field,
            `${describeValue(value)} is not a \`direction\`. Use ${quoteList(MORPH_DIRECTIONS)}.`,
          );
        }
        break;
      case "easing": {
        const problem =
          typeof value === "string"
            ? easingProblem(value)
            : "`easing` is a timing function, such as `ease-out` or `steps(3)`.";
        if (problem) report(field, problem);
        break;
      }
    }
  }
}
