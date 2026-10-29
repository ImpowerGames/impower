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
  MORPH_LITERAL_LIST_KEYS,
  MORPH_METHODS,
  MORPH_PAINT_FIELDS,
  MORPH_POLICY_FIELDS,
  MORPH_ROOT_FIELDS,
  MORPH_TIMING_FIELDS,
  easingProblem,
  parseMorphDepth,
  parseMorphQualifiedState,
  parseMorphSpan,
} from "./morphSchema";
import { morphRequirements } from "./bindMorph";
import { readEntryColor } from "../../morph/color";
import type { MorphBody, MorphIssue } from "./readMorphBody";

type Span = { from: number; to: number };
type Where = "root" | "timing" | "layer" | "keyframe" | "container" | "clip" | "paint";

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

const HOME: Record<string, string> = {};
for (const f of MORPH_TIMING_FIELDS) HOME[f] = "in `timing { … }`";
for (const f of MORPH_POLICY_FIELDS)
  HOME[f] = "at the morph root or under a label in `layers { … }`";
for (const f of MORPH_CONTAINER_FIELDS)
  HOME[f] = "in a keyframe container such as `eyes { … }`";
for (const f of MORPH_CLIP_FIELDS) HOME[f] = "in a `clips { … }` entry";
for (const f of MORPH_PAINT_FIELDS) HOME[f] ??= "in a `paints { … }` entry";
HOME["targets"] = "in a `clips { … }` or `paints { … }` entry";
for (const f of ["keyframes", "layers", "clips", "paints"]) HOME[f] = "at the morph root";
HOME["timing"] = "at the morph root";
HOME["offset"] = "directly in a keyframe";

const ALLOWED: Record<Where, readonly string[]> = {
  root: MORPH_ROOT_FIELDS,
  timing: MORPH_TIMING_FIELDS,
  layer: MORPH_POLICY_FIELDS,
  keyframe: ["offset"],
  container: MORPH_CONTAINER_FIELDS,
  clip: MORPH_CLIP_FIELDS,
  paint: MORPH_PAINT_FIELDS,
};

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

const POLICY_VOCABULARY: Record<string, readonly string[]> = {
  blend: MORPH_BLENDS,
  method: MORPH_METHODS,
  fallback: MORPH_FALLBACKS,
};

const DEPTH_FORMS =
  "Use `rest` or a state the keyframes name, written with its group, such as `eyes.closed`.";

function depthFormProblem(value: unknown): string | null {
  return parseMorphDepth(value)
    ? null
    : `${describeValue(value)} is not a \`depth\`. ${DEPTH_FORMS}`;
}

function keyframeStates(keyframes: unknown): Map<string, string[]> {
  const states = new Map<string, string[]>();
  if (!Array.isArray(keyframes)) return states;
  for (const keyframe of keyframes) {
    if (!isRecord(keyframe)) continue;
    for (const [group, container] of Object.entries(keyframe)) {
      if (!isRecord(container) || typeof container["state"] !== "string") continue;
      const written = container["state"];
      const state = written.startsWith(`${group}.`) ? written.slice(group.length + 1) : written;
      const list = states.get(group) ?? [];
      if (!list.includes(state)) list.push(state);
      states.set(group, list);
    }
  }
  return states;
}

function depthProblem(value: unknown, driven: Map<string, string[]>): string | null {
  const parsed = parseMorphDepth(value);
  const qualified = [...driven].flatMap(([group, states]) => states.map((s) => `${group}.${s}`));
  if (!parsed) {
    const having = typeof value === "string" ? qualified.filter((q) => q.endsWith(`.${value}`)) : [];
    if (having.length > 0) {
      return `\`depth\` names a state with its group. Write ${having.map((q) => `\`depth = ${q}\``).join(" or ")}.`;
    }
    return depthFormProblem(value);
  }
  if (parsed === "rest") return null;
  const states = driven.get(parsed.group);
  const choices = qualified.length ? ` Use \`rest\` or ${quoteList(qualified)}.` : "";
  if (!states) {
    return `\`depth = ${value}\` names the \`${parsed.group}\` group, but this morph does not drive \`${parsed.group}\`.${choices}`;
  }
  if (!states.includes(parsed.state)) {
    return `This morph never shows \`${value}\`, so \`depth\` cannot name it: no keyframe sets \`${parsed.group}\` to \`${parsed.state}\`.${choices}`;
  }
  return null;
}

const PAINT_ENTRY =
  "A `paints` entry is a `{ … }` entry with `targets { … }`, a `state` and a `fill` or `stroke`: `{ targets { eyelash-left }; state = eyes.closed; fill = #c9c9c9 }`.";

function paintStateProblem(value: unknown, driven: Map<string, string[]>, start: Map<string, string>): string | null {
  const poses = [...driven].flatMap(([group, states]) => states.filter((s) => s !== start.get(group)).map((s) => `${group}.${s}`));
  const choices = poses.length ? ` Use ${quoteList(poses)}.` : "";
  const parsed = parseMorphQualifiedState(value);
  if (!parsed) {
    const having = typeof value === "string" ? poses.filter((q) => q.endsWith(`.${value}`)) : [];
    if (having.length > 0) {
      return `A \`paints\` entry's \`state\` names a state with its group. Write ${having.map((q) => `\`state = ${q}\``).join(" or ")}.`;
    }
    return `${describeValue(value)} is not a pose: write a state with its group, such as \`state = eyes.closed\`.`;
  }
  const states = driven.get(parsed.group);
  if (!states) {
    return `\`state = ${value}\` names the \`${parsed.group}\` group, but this morph does not drive \`${parsed.group}\`.${choices}`;
  }
  if (!states.includes(parsed.state)) {
    return `This morph never shows \`${value}\`, so a \`paints\` entry cannot name it: no keyframe sets \`${parsed.group}\` to \`${parsed.state}\`.${choices}`;
  }
  if (start.get(parsed.group) === parsed.state) {
    return `\`${value}\` is the state this morph starts from, the pose each variant rests in, so a \`paints\` entry cannot name it.${choices}`;
  }
  return null;
}

function paintWhenProblem(value: unknown, driven: Map<string, string[]>): string | null {
  const parsed = parseMorphQualifiedState(value);
  if (!parsed) return `\`when\` names a state with its group, such as \`when = mask.on\`.`;
  if (driven.has(parsed.group)) {
    return `\`when = ${value}\` names the \`${parsed.group}\` group, which this morph drives. \`when\` names a state of a group the morph does not drive, such as \`mask.on\`.`;
  }
  return null;
}

function paintColorProblem(field: string, value: unknown): string | null {
  return readEntryColor(value)
    ? null
    : `${describeValue(value)} is not a \`${field}\` colour. Write hex, \`rgb()\`, \`rgba()\`, \`hsl()\`, \`hsla()\` or a named colour, such as \`${field} = #c9c9c9\`.`;
}

const SPAN_PROBLEM = "`span` is a percentage from `0%` to `100%` or a number from 0 to 1, such as `span = 40%`.";

function paintFormProblems(entry: Record<string, unknown>): { field: string; message: string }[] {
  const problems: { field: string; message: string }[] = [];
  if (!("state" in entry)) {
    problems.push({ field: "", message: "This `paints` entry needs a `state`: the pose its colour belongs to, written with its group, such as `state = eyes.closed`." });
  }
  if ("when" in entry && !parseMorphQualifiedState(entry["when"])) {
    problems.push({ field: "when", message: paintWhenProblem(entry["when"], new Map())! });
  }
  if (!("fill" in entry) && !("stroke" in entry)) {
    problems.push({ field: "", message: "This `paints` entry needs a `fill` or a `stroke` colour, such as `fill = #c9c9c9`." });
  }
  for (const field of ["fill", "stroke"]) {
    const problem = field in entry ? paintColorProblem(field, entry[field]) : null;
    if (problem) problems.push({ field, message: problem });
  }
  if ("span" in entry && parseMorphSpan(entry["span"]) === undefined) problems.push({ field: "span", message: SPAN_PROBLEM });
  return problems;
}

const THREE_D_FUNCTION_RE =
  /\b(?:matrix3d|translate3d|translateZ|scale3d|scaleZ|rotate3d|rotateX|rotateY|perspective)\s*\(/i;

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
  name: Span;
  parent: Span | null;
  block: Span;
  withKeyword: Span | null;
  own: MorphBody;
  effective: Record<string, unknown>;
  parentEffective: Record<string, unknown> | null;
}

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

  const colonFields = (block: unknown, fields: readonly string[]): boolean => {
    if (!Array.isArray(block)) return false;
    let found = false;
    block.forEach((item, i) => {
      const match = typeof item === "string" ? /^([A-Za-z_][\w-]*)[ \t]*:[ \t]*(.*)$/.exec(item.trim()) : null;
      if (!match || !fields.includes(match[1]!)) return;
      const written = MORPH_LITERAL_LIST_KEYS.has(match[1]!) ? `${match[1]} { ${match[2]} }` : `${match[1]} = ${match[2]}`;
      push(src(block)?.items[i], `\`${match[1]}:\` does not set a field: write \`${written}\`.`);
      found = true;
    });
    return found;
  };

  if (!decl.withKeyword) {
    push(
      decl.name,
      "Expected `with` after the morph's name: `morph NAME with … end`.",
    );
  }

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

  const driven = keyframeStates(decl.effective["keyframes"]);
  const checkPolicy = (obj: Record<string, unknown>) => {
    for (const field of MORPH_POLICY_FIELDS) {
      if (!(field in obj)) continue;
      const value = obj[field];
      const vocab = POLICY_VOCABULARY[field];
      const problem = vocab
        ? has(vocab, value)
          ? null
          : `${describeValue(value)} is not a \`${field}\`. Use ${quoteList(vocab)}.`
        : depthProblem(value, driven);
      if (problem) push(valueSpan(obj, field), problem);
    }
  };

  const own = decl.own.struct;
  checkFields(own, "root");
  checkPolicy(own);

  const layers = own["layers"];
  if (layers !== undefined) {
    if (!isRecord(layers)) {
      push(
        valueSpan(own, "layers"),
        "`layers` holds labels, each with its own `blend`, `method`, `fallback` or `depth`: `layers { creases { fallback = scale } }`.",
      );
    } else {
      for (const [label, policy] of Object.entries(layers)) {
        if (!isRecord(policy)) {
          if (colonFields(policy, MORPH_POLICY_FIELDS)) continue;
          push(
            src(layers)?.lines.get(label),
            `\`${label}\` in \`layers { … }\` is a label: write \`${label} { … }\` with its \`blend\`, \`method\`, \`fallback\` or \`depth\` inside.`,
          );
          continue;
        }
        checkFields(policy, "layer");
        checkPolicy(policy);
      }
    }
  }

  const timing = own["timing"];
  if (timing !== undefined) {
    if (!isRecord(timing)) {
      if (!colonFields(timing, MORPH_TIMING_FIELDS)) push(valueSpan(own, "timing"), "`timing` is a block of fields: `timing { duration = 0.25 }`.");
    } else {
      checkFields(timing, "timing");
      checkTiming(timing, (field, message) =>
        push(valueSpan(timing, field), message),
      );
    }
  }

  const keyframes = own["keyframes"];
  if (keyframes !== undefined) {
    if (!Array.isArray(keyframes)) {
      push(
        keySpan(own, "keyframes"),
        isRecord(keyframes)
          ? "Write each keyframe as a position (`from { … }`, `50% { … }`, `to { … }`) or as a `{ … }` entry with an `offset`."
          : "`keyframes` is a list of poses: `keyframes { … }` holding positions (`from { … }`, `50% { … }`, `to { … }`) or `{ … }` entries.",
      );
    } else {
      let previous: { offset: number; span?: SourceSpan } | null = null;
      keyframes.forEach((keyframe, index) => {
        const itemLine = src(keyframes)?.items[index];
        if (!isRecord(keyframe)) {
          push(
            itemLine,
            "A keyframe is a pose, not a single value: write containers such as `eyes { state = closed }` inside the keyframe.",
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
            if (colonFields(container, MORPH_CONTAINER_FIELDS)) {
              poses += 1;
              continue;
            }
            const line = src(keyframe)?.lines.get(key);
            if (HOME[key] && !(MORPH_CONTAINER_FIELDS as readonly string[]).includes(key)) {
              push(keySpan(keyframe, key), `\`${key}\` belongs ${HOME[key]}.`);
            } else if (
              (MORPH_CONTAINER_FIELDS as readonly string[]).includes(key)
            ) {
              push(
                keySpan(keyframe, key),
                `\`${key}\` belongs in a container naming the group or layer it poses: \`eyes { ${key} = … }\`.`,
              );
            } else {
              push(
                line,
                `\`${key} = …\` is not a pose. Write \`${key} { … }\` with \`state = …\` or a layer property inside.`,
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
              `\`${key} { … }\` poses nothing: add \`state = …\` or a layer property such as \`translate = 0 8px\`.`,
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
            "This keyframe poses nothing: add a container such as `eyes { state = … }`.",
          );
        }
      });
    }
  }

  const clips = own["clips"];
  if (clips !== undefined) {
    if (!Array.isArray(clips)) {
      push(
        keySpan(own, "clips"),
        "`clips` is a list: each `{ … }` entry has `between { … }` and `targets { … }` label lists.",
      );
    } else {
      clips.forEach((clip, index) => {
        const itemLine = src(clips)?.items[index];
        if (!isRecord(clip)) {
          if (colonFields(clip, MORPH_CLIP_FIELDS)) return;
          push(itemLine, "A clip entry is a `{ … }` entry with `between { … }` and `targets { … }` label lists.");
          return;
        }
        checkFields(clip, "clip");
        const lists: Record<string, string[]> = {};
        for (const field of MORPH_CLIP_FIELDS) {
          const list = clip[field];
          if (list === undefined) {
            push(itemLine ?? lineSpan(clip), `This clip entry needs \`${field} { … }\` with at least one layer label.`);
            continue;
          }
          if (!Array.isArray(list) || list.length === 0) {
            push(keySpan(clip, field), `\`${field}\` is a list of layer labels: \`${field} { eyelash-left }\`.`);
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

  const start = morphRequirements(decl.effective).rest;
  const paints = own["paints"];
  if (paints !== undefined) {
    if (!Array.isArray(paints)) {
      push(keySpan(own, "paints"), `\`paints\` is a list of \`{ … }\` entries. ${PAINT_ENTRY}`);
    } else {
      paints.forEach((entry, index) => {
        const itemLine = src(paints)?.items[index];
        if (!isRecord(entry)) {
          if (!colonFields(entry, MORPH_PAINT_FIELDS)) push(itemLine, PAINT_ENTRY);
          return;
        }
        checkFields(entry, "paint");
        const entryLine = itemLine ?? lineSpan(entry);
        const targets = entry["targets"];
        if (targets === undefined) {
          push(entryLine, "This `paints` entry needs `targets { … }` with at least one layer label.");
        } else if (!Array.isArray(targets) || targets.length === 0) {
          push(keySpan(entry, "targets"), "`targets` is a list of layer labels: `targets { eyelash-left }`.");
        } else {
          targets.forEach((label, i) => {
            if (typeof label !== "string" || label.trim() === "") {
              push(src(targets)?.items[i], "A `targets` item is a layer label, such as `eyelash-left`.");
            }
          });
        }
        for (const { field, message } of paintFormProblems(entry)) {
          push(field ? valueSpan(entry, field) : entryLine, message);
        }
        if ("state" in entry) {
          const problem = paintStateProblem(entry["state"], driven, start);
          if (problem) push(valueSpan(entry, "state"), problem);
        }
        if ("when" in entry && parseMorphQualifiedState(entry["when"])) {
          const problem = paintWhenProblem(entry["when"], driven);
          if (problem) push(valueSpan(entry, "when"), problem);
        }
      });
    }
  }

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
  const parentDriven = decl.parentEffective && keyframeStates(decl.parentEffective["keyframes"]);
  const valueAt = (morph: Record<string, unknown> | null, field: string): unknown => {
    let current: unknown = morph;
    for (const key of field.split(".")) current = isRecord(current) ? current[key] : undefined;
    return current;
  };
  const ownLayers = isRecord(own["layers"]) ? own["layers"] : {};
  const inherited: string[] = [];
  if (!("depth" in own)) inherited.push("depth");
  if (isRecord(effectiveLayers)) {
    for (const [label, policy] of Object.entries(effectiveLayers)) {
      const written = ownLayers[label];
      if (isRecord(policy) && "depth" in policy && !(isRecord(written) && "depth" in written)) {
        inherited.push(`layers.${label}.depth`);
      }
    }
  }
  for (const field of inherited) {
    const value = valueAt(effective, field);
    if (value === undefined || depthFormProblem(value)) continue;
    const problem = depthProblem(value, driven);
    if (!problem) continue;
    if (parentDriven && valueAt(decl.parentEffective, field) === value && depthProblem(value, parentDriven)) continue;
    push(decl.parent, `\`${field}\`, inherited: ${problem}`);
  }
  const effectivePaints = effective["paints"];
  if (!("paints" in own) && Array.isArray(effectivePaints)) {
    const parentStart = decl.parentEffective && morphRequirements(decl.parentEffective).rest;
    const parentPaints = decl.parentEffective?.["paints"];
    effectivePaints.forEach((entry, index) => {
      if (!isRecord(entry)) return;
      const problems = (keyframes: Map<string, string[]>, starts: Map<string, string>) => [
        parseMorphQualifiedState(entry["state"]) ? paintStateProblem(entry["state"], keyframes, starts) : null,
        parseMorphQualifiedState(entry["when"]) ? paintWhenProblem(entry["when"], keyframes) : null,
      ];
      const fromParent = Array.isArray(parentPaints) && JSON.stringify(parentPaints[index]) === JSON.stringify(entry);
      problems(driven, start).forEach((problem, i) => {
        if (!problem) return;
        if (fromParent && parentDriven && parentStart && problems(parentDriven, parentStart)[i]) return;
        push(decl.parent, `\`paints\` entry ${index + 1}, inherited: ${problem}`);
      });
    });
  }
  const effectiveTiming = effective["timing"];
  if (isRecord(effectiveTiming)) {
    const min = effectiveTiming["iteration_delay_min"];
    const max = effectiveTiming["iteration_delay_max"];
    const ownTiming = isRecord(timing) ? timing : undefined;
    const spanOf = (field: string) =>
      (ownTiming && keySpan(ownTiming, field)) || decl.parent || decl.name;
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

export function morphValueProblems(
  struct: Record<string, unknown>,
): { field: string; message: string }[] {
  const problems: { field: string; message: string }[] = [];
  const policy = (obj: Record<string, unknown>, prefix: string) => {
    for (const field of MORPH_POLICY_FIELDS) {
      if (!(field in obj)) continue;
      const vocab = POLICY_VOCABULARY[field];
      const message = vocab
        ? has(vocab, obj[field])
          ? null
          : `${describeValue(obj[field])} is not a \`${field}\`. Use ${quoteList(vocab)}.`
        : depthFormProblem(obj[field]);
      if (message) problems.push({ field: `${prefix}${field}`, message });
    }
  };
  policy(struct, "");
  const layers = struct["layers"];
  if (isRecord(layers)) {
    for (const [label, value] of Object.entries(layers)) {
      if (isRecord(value)) policy(value, `layers.${label}.`);
    }
  }
  const timing = struct["timing"];
  if (isRecord(timing)) {
    checkTiming(timing, (field, message) =>
      problems.push({ field: `timing.${field}`, message }),
    );
  }
  const paints = struct["paints"];
  if (paints !== undefined && !Array.isArray(paints) && !(isRecord(paints) && Object.keys(paints).length === 0)) {
    problems.push({ field: "paints", message: `\`paints\` is a list of \`{ … }\` entries. ${PAINT_ENTRY}` });
  }
  if (Array.isArray(paints)) {
    paints.forEach((entry, index) => {
      const add = (message: string) => problems.push({ field: "paints", message: `entry ${index + 1}: ${message}` });
      if (!isRecord(entry)) {
        add(PAINT_ENTRY);
        return;
      }
      for (const key of Object.keys(entry)) {
        if ((MORPH_PAINT_FIELDS as readonly string[]).includes(key)) continue;
        add(HOME[key] ? `\`${key}\` belongs ${HOME[key]}.` : `Unknown morph field \`${key}\`.`);
      }
      const targets = entry["targets"];
      if (targets === undefined) {
        add("This `paints` entry needs `targets { … }` with at least one layer label.");
      } else if (!Array.isArray(targets) || targets.length === 0 || targets.some((label) => typeof label !== "string" || label.trim() === "")) {
        add("`targets` is a list of layer labels: `targets { eyelash-left }`.");
      }
      if ("state" in entry && !parseMorphQualifiedState(entry["state"])) {
        add(`${describeValue(entry["state"])} is not a pose: write a state with its group, such as \`state = eyes.closed\`.`);
      }
      for (const { message } of paintFormProblems(entry)) add(message);
    });
  }
  return problems;
}

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
