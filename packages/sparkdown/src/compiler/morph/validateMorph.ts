import type {
  SourceSpan,
  StructSource,
} from "../lower/lowerers/lowerStructBodyTyped";
import {
  MORPH_BLENDS,
  MORPH_CLIP_FIELDS,
  MORPH_CLIP_LIST_FIELDS,
  MORPH_CONDITION_FIELDS,
  MORPH_CONTAINER_FIELDS,
  MORPH_DIRECTIONS,
  MORPH_FALLBACKS,
  MORPH_LAYER_FIELDS,
  MORPH_LAYER_PROPERTIES,
  MORPH_METHODS,
  MORPH_PAINT_FIELDS,
  MORPH_POLICY_FIELDS,
  MORPH_ROOT_FIELDS,
  MORPH_SPREAD_PROBLEM,
  MORPH_TIMING_FIELDS,
  easingProblem,
  parseMorphDepth,
  parseMorphPartner,
  parseMorphQualifiedState,
  parseMorphSpan,
  parseMorphSpread,
} from "./morphSchema";
import { morphRequirements } from "./bindMorph";
import { readEntryColor } from "../../morph/color";
import { morphMotionProblem } from "../../morph/motion";
import { normalizeMorphKeyframes } from "./normalizeMorphKeyframes";
import { poseStateProblems, type MorphBody, type MorphIssue } from "./readMorphBody";

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
for (const f of MORPH_LAYER_FIELDS) HOME[f] = "under a label in `layers { … }`";
for (const f of MORPH_CONTAINER_FIELDS)
  HOME[f] = "in a keyframe container such as `eyes { … }`";
for (const f of MORPH_CLIP_FIELDS) HOME[f] = "in a `clips { … }` entry";
for (const f of MORPH_PAINT_FIELDS) HOME[f] ??= "in a `paints { … }` entry";
HOME["targets"] = "in a `clips { … }` or `paints { … }` entry";
for (const f of ["keyframes", "layers", "clips", "paints", "unless", "rest"]) HOME[f] = "at the morph root";
HOME["when"] = "at the morph root or in a `paints { … }` entry";
HOME["timing"] = "at the morph root";
HOME["spread"] = "at the morph root, under a label in `layers { … }` or in a `clips { … }` entry";
HOME["offset"] = "directly in a keyframe";

const ALLOWED: Record<Where, readonly string[]> = {
  root: MORPH_ROOT_FIELDS,
  timing: MORPH_TIMING_FIELDS,
  layer: [...MORPH_POLICY_FIELDS, ...MORPH_LAYER_FIELDS],
  keyframe: ["offset"],
  container: MORPH_CONTAINER_FIELDS,
  clip: MORPH_CLIP_FIELDS,
  paint: MORPH_PAINT_FIELDS,
};

const POLICY_VOCABULARY: Record<string, readonly string[]> = {
  blend: MORPH_BLENDS,
  method: MORPH_METHODS,
  fallback: MORPH_FALLBACKS,
};

const spreadProblem = (value: unknown): string | null => (parseMorphSpread(value) === undefined ? MORPH_SPREAD_PROBLEM : null);

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

const PARTNER_FORMS = "such as `partner = eyelash-left` or `partner = { eyeball-shadow-left; eyelash-left }`";

function partnerFormProblem(value: unknown): { item?: number; message: string } | null {
  if (parseMorphPartner(value)) return null;
  const empty = (Array.isArray(value) && value.length === 0) || (isRecord(value) && Object.keys(value).length === 0) || value === "";
  if (empty) return { message: `\`partner\` needs at least one label, ${PARTNER_FORMS}.` };
  const item = Array.isArray(value) ? value.findIndex((label) => typeof label !== "string" || label.trim() === "") : -1;
  return { ...(item >= 0 ? { item } : {}), message: `\`partner\` names a label or a list of labels, ${PARTNER_FORMS}.` };
}

function edgeLabels(morph: Record<string, unknown> | null): Set<string> {
  const edges = new Set<string>();
  const clips = morph?.["clips"];
  for (const clip of Array.isArray(clips) ? clips : []) {
    const between = isRecord(clip) ? clip["between"] : undefined;
    for (const label of Array.isArray(between) ? between : []) if (typeof label === "string") edges.add(label);
  }
  return edges;
}

const partnerEdgeProblem = (label: string) =>
  `\`${label}\` forms an aperture in \`clips\`, so it cannot take a partner: an aperture edge pairs by its own label.`;

const PAINT_ENTRY =
  "A `paints` entry is a `{ … }` entry with `targets { … }`, a `state` and at least one of `fill`, `stroke` and `opacity`: `{ targets { eyelash-left }; state = eyes.closed; fill = #c9c9c9 }`.";

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
    return `\`${value}\` is the state this morph starts from, so a \`paints\` entry cannot name it.${choices}`;
  }
  return null;
}

const KEYFRAME_OFFSET_FORM = "A keyframe `offset` is a number from 0 to 1.";

const keyframeRangeProblem = (offset: number) =>
  `Keyframe position \`${Number((offset * 100).toFixed(4))}%\` must be between 0% and 100%.`;

const restUndrivenProblem = (group: string, driven: Map<string, string[]>) => {
  const drives = [...driven.keys()];
  return `\`rest\` gives \`${group}\` a state, but no keyframe sets \`${group}\`'s \`state\`, so this morph does not drive it.${drives.length ? ` It drives ${quoteList(drives)}.` : ""}`;
};

const REST_FORM = "`rest` holds group containers with a `state` each, written like a keyframe's: `rest { mouth { state = teeth } }`.";

function restValueProblems(rest: unknown): { group?: string; key?: string; missingState?: true; message: string }[] {
  const writtenState = (value: unknown, group?: string): string | undefined => {
    const text = isRecord(value) && typeof value["$type"] === "string" && typeof value["$name"] === "string"
      ? `${value["$type"]}.${value["$name"]}`
      : typeof value === "string" ? value : undefined;
    const parsed = text === undefined ? undefined : parseMorphQualifiedState(text);
    if (parsed && (group === undefined || parsed.group === group)) return `rest { ${parsed.group} { state = ${parsed.state} } }`;
    if (text && group !== undefined && !text.includes(".")) return `rest { ${group} { state = ${text} } }`;
    return undefined;
  };
  if (!isRecord(rest) || "$type" in rest || "$name" in rest) {
    const fix = writtenState(rest);
    return [{ message: fix ? `\`rest\` is a block, not a value: write \`${fix}\`.` : REST_FORM }];
  }
  const problems: { group?: string; key?: string; missingState?: true; message: string }[] = [];
  for (const [group, container] of Object.entries(rest)) {
    if (group.startsWith("$")) continue;
    if (!isRecord(container) || "$type" in container || "$name" in container) {
      const fix = writtenState(container, group);
      problems.push({ group, message: `\`${group} = …\` is not a pose. ${fix ? `Write \`${fix}\`.` : REST_FORM}` });
      continue;
    }
    for (const key of Object.keys(container)) {
      if (key === "state" || key.startsWith("$")) continue;
      problems.push({
        group,
        key,
        message: (MORPH_LAYER_PROPERTIES as readonly string[]).includes(key)
          ? `\`${key}\` does not belong in \`rest\`: a moved layer rests where it is drawn. \`rest\` holds group states only, such as \`rest { mouth { state = teeth } }\`.`
          : HOME[key]
            ? `\`${key}\` belongs ${HOME[key]}.`
            : `Unknown morph field \`${key}\`.`,
      });
    }
    const state = container["state"];
    if (!("state" in container)) {
      problems.push({ group, missingState: true, message: `\`${group} { … }\` in \`rest\` needs a \`state\`, such as \`${group} { state = … }\`.` });
    } else if (typeof state !== "string" || state.trim() === "") {
      problems.push({ group, key: "state", message: "`state` names an attribute state, such as `closed` or `eyes.closed`." });
    }
  }
  return problems;
}

function conditionProblems(
  field: "when" | "unless",
  value: unknown,
  driven: Map<string, string[]>,
): { item?: number; message: string }[] {
  const example = field === "when" ? "mouth.teeth" : "eyes.closed";
  const forms = `one state, such as \`${field} = ${example}\`, or a block of several, such as \`${field} { eyes.closed; mask.on }\``;
  const list = typeof value === "string" ? [value] : Array.isArray(value) ? value : undefined;
  if (!list || list.length === 0) return [{ message: `\`${field}\` names states with their groups: ${forms}.` }];
  const problems: { item?: number; message: string }[] = [];
  list.forEach((item, index) => {
    if (parseMorphQualifiedState(item)) return;
    const at = Array.isArray(value) ? { item: index } : {};
    const having = typeof item === "string" ? [...driven].filter(([, states]) => states.includes(item)).map(([group]) => `${group}.${item}`) : [];
    problems.push({
      ...at,
      message: having.length
        ? `\`${field}\` names a state with its group. Write ${having.map((q) => `\`${field} = ${q}\``).join(" or ")}.`
        : `${describeValue(item)} is not a state with its group: ${forms}.`,
    });
  });
  return problems;
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
const OPACITY_PROBLEM = "A `paints` entry's `opacity` is a number from 0 to 1 or a percentage from `0%` to `100%`, such as `opacity = 0`.";

function paintFormProblems(entry: Record<string, unknown>): { field: string; message: string }[] {
  const problems: { field: string; message: string }[] = [];
  if (!("state" in entry)) {
    problems.push({ field: "", message: "This `paints` entry needs a `state`: the pose its colour belongs to, written with its group, such as `state = eyes.closed`." });
  }
  if ("when" in entry && !parseMorphQualifiedState(entry["when"])) {
    problems.push({ field: "when", message: paintWhenProblem(entry["when"], new Map())! });
  }
  if (!("fill" in entry) && !("stroke" in entry) && !("opacity" in entry)) {
    problems.push({ field: "", message: "This `paints` entry needs a `fill` or `stroke` colour or an `opacity`, such as `fill = #c9c9c9` or `opacity = 0`." });
  }
  if ("opacity" in entry && parseMorphSpan(entry["opacity"]) === undefined) problems.push({ field: "opacity", message: OPACITY_PROBLEM });
  for (const field of ["fill", "stroke"]) {
    const problem = field in entry ? paintColorProblem(field, entry[field]) : null;
    if (problem) problems.push({ field, message: problem });
  }
  if ("span" in entry && parseMorphSpan(entry["span"]) === undefined) problems.push({ field: "span", message: SPAN_PROBLEM });
  return problems;
}

export interface MorphDeclaration {
  name: Span;
  parent: Span | null;
  block: Span;
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
      const problem =
        field === "spread"
          ? spreadProblem(value)
          : vocab
            ? has(vocab, value)
              ? null
              : `${describeValue(value)} is not a \`${field}\`. Use ${quoteList(vocab)}.`
            : depthProblem(value, driven);
      if (problem) push(valueSpan(obj, field), problem);
    }
  };

  const edges = edgeLabels(decl.effective);
  const checkPartner = (label: string, policy: Record<string, unknown>) => {
    const value = policy["partner"];
    const list = Array.isArray(value) ? value : undefined;
    const itemSpan = (i: number) => (list ? (src(list)?.itemValues[i] ?? src(list)?.items[i]) : valueSpan(policy, "partner"));
    const problem = partnerFormProblem(value);
    if (problem) {
      push(problem.item === undefined ? keySpan(policy, "partner") : itemSpan(problem.item), problem.message);
      return;
    }
    if (edges.has(label)) {
      push(keySpan(policy, "partner"), partnerEdgeProblem(label));
      return;
    }
    const labels = parseMorphPartner(value)!;
    if (labels.every((l) => l === label)) {
      push(itemSpan(0), `\`partner\` names only \`${label}\` itself, which pairs by name just as leaving \`partner\` out does.`, "warning");
    }
    labels.forEach((l, i) => {
      if (labels.indexOf(l) < i) push(itemSpan(i), `\`${l}\` is listed twice in \`partner\`; its first mention sets its rank.`, "warning");
    });
  };

  const own = decl.own.struct;
  checkFields(own, "root");
  checkPolicy(own);

  const layers = own["layers"];
  if (layers !== undefined) {
    if (!isRecord(layers)) {
      push(
        valueSpan(own, "layers"),
        `\`layers\` holds labels, each with its own ${quoteList(ALLOWED.layer)}: \`layers { creases { fallback = scale } }\`.`,
      );
    } else {
      for (const [label, policy] of Object.entries(layers)) {
        if (!isRecord(policy)) {
          push(
            src(layers)?.lines.get(label),
            `\`${label}\` in \`layers { … }\` is a label: write \`${label} { … }\` with its ${quoteList(ALLOWED.layer)} inside.`,
          );
          continue;
        }
        checkFields(policy, "layer");
        checkPolicy(policy);
        if ("partner" in policy) checkPartner(label, policy);
      }
    }
  }

  const timing = own["timing"];
  if (timing !== undefined) {
    if (!isRecord(timing)) {
      push(valueSpan(own, "timing"), "`timing` is a block of fields: `timing { duration = 0.25 }`.");
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
            push(span, KEYFRAME_OFFSET_FORM);
          } else if (offset < 0 || offset > 1) {
            if (src(keyframe)?.values.get("offset")) push(span, keyframeRangeProblem(offset));
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
          if (!isRecord(container) || "$type" in container || "$name" in container) {
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
            const problem = morphMotionProblem(property, container[property]);
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
          push(itemLine, "A clip entry is a `{ … }` entry with `between { … }` and `targets { … }` label lists.");
          return;
        }
        checkFields(clip, "clip");
        const lists: Record<string, string[]> = {};
        if ("spread" in clip && parseMorphSpread(clip["spread"]) === undefined) {
          push(valueSpan(clip, "spread"), MORPH_SPREAD_PROBLEM);
        }
        for (const field of MORPH_CLIP_LIST_FIELDS) {
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

  const start = morphRequirements(decl.effective).start;
  const paints = own["paints"];
  if (paints !== undefined) {
    if (!Array.isArray(paints)) {
      push(keySpan(own, "paints"), `\`paints\` is a list of \`{ … }\` entries. ${PAINT_ENTRY}`);
    } else {
      paints.forEach((entry, index) => {
        const itemLine = src(paints)?.items[index];
        if (!isRecord(entry)) {
          push(itemLine, PAINT_ENTRY);
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

  for (const field of MORPH_CONDITION_FIELDS) {
    if (!(field in own)) continue;
    const value = own[field];
    const list = Array.isArray(value) ? value : undefined;
    for (const problem of conditionProblems(field, value, driven)) {
      const span =
        problem.item !== undefined && list
          ? (src(list)?.itemValues[problem.item] ?? src(list)?.items[problem.item])
          : (valueSpan(own, field) ?? keySpan(own, field));
      push(span, problem.message);
    }
  }

  const rest = own["rest"];
  if (rest !== undefined) {
    for (const problem of restValueProblems(rest)) {
      const container = problem.group === undefined || !isRecord(rest) ? undefined : rest[problem.group];
      const span =
        problem.group === undefined
          ? (valueSpan(own, "rest") ?? keySpan(own, "rest"))
          : problem.key === undefined
            ? (problem.missingState ? (lineSpan(container) ?? keySpan(rest, problem.group)) : (src(rest)?.lines.get(problem.group) ?? keySpan(rest, problem.group)))
            : problem.key === "state"
              ? valueSpan(container, "state")
              : keySpan(container, problem.key);
      push(span, problem.message);
    }
    if (isRecord(rest)) {
      for (const [group, container] of Object.entries(rest)) {
        const state = isRecord(container) && !("$type" in container) && !("$name" in container) ? container["state"] : undefined;
        if (typeof state !== "string" || state.trim() === "") continue;
        if (!driven.has(group)) {
          push(keySpan(rest, group), restUndrivenProblem(group, driven));
        }
      }
    }
  }

  const effectiveRest = decl.effective["rest"];
  if (decl.parent && isRecord(effectiveRest)) {
    const ownGroups = isRecord(rest) ? Object.keys(rest) : [];
    const parentDrives = decl.parentEffective ? keyframeStates(decl.parentEffective["keyframes"]) : undefined;
    for (const group of Object.keys(effectiveRest)) {
      if (group.startsWith("$") || ownGroups.includes(group) || driven.has(group)) continue;
      if (parentDrives && !parentDrives.has(group)) continue;
      push(decl.parent, `\`rest.${group}\`, inherited: ${restUndrivenProblem(group, driven)}`);
    }
  }

  const effective = decl.effective;
  const effectiveKeyframes = effective["keyframes"];
  const poseCount = Array.isArray(effectiveKeyframes)
    ? effectiveKeyframes.length
    : 0;
  if (poseCount < 2) {
    const tooFew = "A morph needs at least two keyframes to move between.";
    const fromParent = decl.parent && !("keyframes" in own) && poseCount > 0;
    push(keySpan(own, "keyframes") ?? (fromParent ? decl.parent : decl.name), fromParent ? `\`keyframes\`, inherited: ${tooFew}` : tooFew);
  }
  if (Array.isArray(effectiveKeyframes) && effectiveKeyframes.length > 0) {
    const ordered = normalizeMorphKeyframes(effectiveKeyframes)
      .map((frame, index) => ({ frame, index }))
      .sort((a, b) => (a.frame["offset"] as number) - (b.frame["offset"] as number) || a.index - b.index);
    const first = ordered[0]!.frame;
    const stateOf = (frame: unknown, group: string) => {
      const container = isRecord(frame) ? frame[group] : undefined;
      return isRecord(container) && typeof container["state"] === "string" && container["state"] !== "";
    };
    const ownKeyframes = Array.isArray(own["keyframes"]) ? own["keyframes"] : [];
    for (const group of driven.keys()) {
      if (stateOf(first, group)) continue;
      const written = ownKeyframes.find((frame) => stateOf(frame, group)) as Record<string, unknown> | undefined;
      push(
        written ? valueSpan(written[group], "state") : (decl.parent ?? decl.name),
        `\`${group}\` takes a \`state\` in a later keyframe but not in the first one. Each group a morph drives starts from the state written in its first keyframe: add \`${group} { state = … }\` to the first keyframe.`,
      );
    }
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
  const parentEdges = edgeLabels(decl.parentEffective);
  if (isRecord(effectiveLayers)) {
    for (const [label, policy] of Object.entries(effectiveLayers)) {
      const written = ownLayers[label];
      if (!isRecord(policy) || !("partner" in policy) || !edges.has(label) || (isRecord(written) && "partner" in written)) continue;
      if (parentEdges.has(label) && valueAt(decl.parentEffective, `layers.${label}.partner`) !== undefined) continue;
      push(decl.parent, `\`layers.${label}.partner\`, inherited: ${partnerEdgeProblem(label)}`);
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
    const parentStart = decl.parentEffective && morphRequirements(decl.parentEffective).start;
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
        push(decl.parent, `\`paints\` (entry ${index + 1}), inherited: ${problem}`);
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

export interface MorphValueProblem {
  field: string;
  where?: string;
  message: string;
}

export function morphValueProblems(
  struct: Record<string, unknown>,
  effective: Record<string, unknown> = struct,
): MorphValueProblem[] {
  const problems: MorphValueProblem[] = [];
  const driven = keyframeStates(effective["keyframes"]);
  const policy = (obj: Record<string, unknown>, prefix: string) => {
    for (const field of MORPH_POLICY_FIELDS) {
      if (!(field in obj)) continue;
      const vocab = POLICY_VOCABULARY[field];
      const message =
        field === "spread"
          ? spreadProblem(obj[field])
          : vocab
            ? has(vocab, obj[field])
              ? null
              : `${describeValue(obj[field])} is not a \`${field}\`. Use ${quoteList(vocab)}.`
            : depthFormProblem(obj[field]);
      if (message) problems.push({ field: `${prefix}${field}`, message });
    }
  };
  policy(struct, "");
  for (const field of MORPH_CONDITION_FIELDS) {
    if (!(field in struct)) continue;
    for (const { item, message } of conditionProblems(field, struct[field], driven)) {
      problems.push({ field, ...(item === undefined ? {} : { where: `entry ${item + 1}` }), message });
    }
  }
  const rest = struct["rest"];
  if (rest !== undefined) {
    for (const problem of restValueProblems(rest)) {
      const field = ["rest", ...(problem.group === undefined ? [] : [problem.group]), ...(problem.key === undefined ? [] : [problem.key])].join(".");
      problems.push({ field, message: problem.message });
    }
  }
  for (const { group, keyframe, message } of poseStateProblems(struct)) {
    problems.push(
      keyframe === undefined
        ? { field: `rest.${group}.state`, message }
        : { field: "keyframes", where: `keyframe ${keyframe + 1}`, message },
    );
  }
  const keyframes = struct["keyframes"];
  if (Array.isArray(keyframes)) {
    let previous: number | undefined;
    keyframes.forEach((keyframe, index) => {
      if (!isRecord(keyframe)) return;
      const at = (message: string) => problems.push({ field: "keyframes", where: `keyframe ${index + 1}`, message });
      for (const [group, container] of Object.entries(keyframe)) {
        if (group === "offset" || group.startsWith("$") || !isRecord(container) || !("state" in container)) continue;
        const state = container["state"];
        if (typeof state !== "string" || state.trim() === "") at("`state` names an attribute state, such as `closed` or `eyes.closed`.");
      }
      if (!("offset" in keyframe)) return;
      const offset = keyframe["offset"];
      if (typeof offset !== "number" || !Number.isFinite(offset)) at(KEYFRAME_OFFSET_FORM);
      else if (offset < 0 || offset > 1) at(keyframeRangeProblem(offset));
      else {
        if (previous !== undefined && offset < previous) at(`Keyframe offsets must not decrease: ${offset} comes after ${previous}.`);
        previous = offset;
      }
    });
  }
  const layers = struct["layers"];
  if (isRecord(layers)) {
    for (const [label, value] of Object.entries(layers)) {
      if (!isRecord(value)) continue;
      policy(value, `layers.${label}.`);
      const problem = "partner" in value ? partnerFormProblem(value["partner"]) : null;
      if (problem) problems.push({ field: `layers.${label}.partner`, message: problem.message });
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
      const add = (message: string) => problems.push({ field: "paints", where: `entry ${index + 1}`, message });
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
