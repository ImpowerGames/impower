import type { ProgramStory as Story } from "@impower/sparkdown/src/program/ProgramStory";
import { MORPH_OWN_FIELDS } from "@impower/sparkdown/src/compiler/morph/morphSchema";
import { applyBuiltinDefaults } from "./applyBuiltinDefaults";

const OWN_FIELDS: Partial<Record<string, ReadonlySet<string>>> = { morph: MORPH_OWN_FIELDS };

const DEFINE_MARKER = "__define";
const DEFINE_PARENT_MARKER = "__defineParent";
const INDEX_MARKER = "__index";

const META_PROP_KEYS = new Set<string>([
  "__storeProps",
  "__readProps",
  "__writeProps",
  DEFINE_MARKER,
  DEFINE_PARENT_MARKER,
  INDEX_MARKER,
]);

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyVal = any;

function asMap(x: AnyVal): Map<string, AnyVal> | null {
  return x instanceof Map ? (x as Map<string, AnyVal>) : null;
}

function metatableMap(v: AnyVal): Map<string, AnyVal> | null {
  const mt = v?.metatable;
  return mt ? asMap(mt.value) : null;
}

function isDefineTable(v: AnyVal): boolean {
  return metatableMap(v)?.get(DEFINE_MARKER) != null;
}

function isClosureMap(map: Map<string, AnyVal>): boolean {
  return map.has("__closure_fn");
}

function metaString(v: AnyVal, key: string): string {
  const entry = metatableMap(v)?.get(key);
  return entry != null && "value" in entry ? String(entry.value) : "";
}

function defineChain(start: AnyVal): AnyVal[] {
  const chain: AnyVal[] = [];
  let cur: AnyVal = start;
  let guard = 0;
  while (cur && asMap(cur.value) && guard++ < 64) {
    chain.push(cur);
    const idx = metatableMap(cur)?.get(INDEX_MARKER) ?? null;
    cur = asMap(idx?.value) ? idx : null;
  }
  return chain;
}

function deepMerge(base: AnyVal, override: AnyVal): AnyVal {
  if (
    base == null ||
    typeof base !== "object" ||
    Array.isArray(base) ||
    override == null ||
    typeof override !== "object" ||
    Array.isArray(override)
  ) {
    return override;
  }
  const result: Record<string, AnyVal> = { ...base };
  for (const [k, v] of Object.entries(override)) {
    const bv = (base as Record<string, AnyVal>)[k];
    if (
      bv != null &&
      typeof bv === "object" &&
      !Array.isArray(bv) &&
      v != null &&
      typeof v === "object" &&
      !Array.isArray(v)
    ) {
      result[k] = deepMerge(bv, v);
    } else {
      result[k] = v;
    }
  }
  return result;
}

function convertValue(v: AnyVal, story: Story): unknown {
  if (v == null) return undefined;
  if (!("value" in v)) return undefined;
  const inner = v.value;
  const map = asMap(inner);
  if (map) return convertTable(map, story);
  return inner;
}

function convertTable(map: Map<string, AnyVal>, story: Story): unknown {
  if (isClosureMap(map)) return undefined;
  const keys = [...map.keys()].filter((k) => !META_PROP_KEYS.has(k));
  const isArray =
    keys.length > 0 && keys.every((k, i) => k === String(i + 1));
  if (isArray) {
    const arr: unknown[] = [];
    for (let i = 1; i <= keys.length; i += 1) {
      const cv = convertValue(map.get(String(i)), story);
      arr.push(cv === undefined ? null : cv);
    }
    return arr;
  }
  const obj: Record<string, unknown> = {};
  for (const [k, val] of map) {
    if (META_PROP_KEYS.has(k)) continue;
    const valMap = asMap(val?.value);
    if (valMap && isClosureMap(valMap)) continue;
    const cv = convertValue(val, story);
    if (cv !== undefined) obj[k] = cv;
  }
  return obj;
}

function collectLevelProps(
  levelMap: Map<string, AnyVal>,
  story: Story,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, val] of levelMap) {
    if (META_PROP_KEYS.has(k)) continue;
    if (k.startsWith("$")) continue;
    if (isDefineTable(val)) continue;
    const valMap = asMap(val?.value);
    if (valMap && isClosureMap(valMap)) continue;
    const cv = convertValue(val, story);
    if (cv !== undefined) out[k] = cv;
  }
  return out;
}

export function convertDefine(
  defineTable: AnyVal,
  story: Story,
  ownFields?: ReadonlySet<string>,
): Record<string, unknown> {
  const chain = defineChain(defineTable);
  let merged: Record<string, unknown> = {};
  for (let i = chain.length - 1; i >= 0; i -= 1) {
    const levelMap = asMap(chain[i].value);
    if (!levelMap) continue;
    const props = collectLevelProps(levelMap, story);
    if (i > 0) {
      for (const field of ownFields ?? []) delete props[field];
    }
    merged = deepMerge(merged, props);
  }
  merged["$type"] = metaString(defineTable, DEFINE_PARENT_MARKER);
  merged["$name"] = metaString(defineTable, DEFINE_MARKER);
  return merged;
}

function listAnimationKeyframes(
  context: Record<string, Record<string, unknown>>,
): void {
  for (const struct of Object.values(context["animation"] ?? {})) {
    if (!struct || typeof struct !== "object") continue;
    const animation = struct as Record<string, unknown>;
    const keyframes = animation["keyframes"];
    if (Array.isArray(keyframes)) continue;
    animation["keyframes"] =
      keyframes && typeof keyframes === "object" ? [keyframes] : [];
  }
}

export function buildDefinesContext(
  story: Story,
): Record<string, Record<string, unknown>> {
  const context: Record<string, Record<string, unknown>> = {};
  const variablesState = story?.state?.variablesState as AnyVal;
  const globals = variablesState?.["_globalVariables"] as
    | Map<string, AnyVal>
    | undefined;
  if (!globals) return context;

  const processed = new Set<AnyVal>();
  const emitted = new Set<string>();
  for (const name of globals.keys()) {
    const typeTable = variablesState.GetVariableWithName(name);
    if (!isDefineTable(typeTable) || processed.has(typeTable)) continue;
    processed.add(typeTable);
    const map = asMap(typeTable.value);
    if (!map) continue;
    const typeName = metaString(typeTable, DEFINE_MARKER);
    if (!typeName) continue;
    if (!metaString(typeTable, DEFINE_PARENT_MARKER)) {
      const defaults = convertDefine(typeTable, story);
      if (Object.keys(defaults).some((k) => !k.startsWith("$"))) {
        defaults["$type"] = typeName;
        defaults["$name"] = "$default";
        (context[typeName] ??= {})["$default"] ??= defaults;
      }
    }
    for (const [key, member] of map) {
      if (META_PROP_KEYS.has(key)) continue;
      if (!isDefineTable(member)) continue;
      const parent = metaString(member, DEFINE_PARENT_MARKER);
      if (!parent) continue;
      const defName = metaString(member, DEFINE_MARKER);
      const dedupeKey = `${typeName}\u0000${defName}`;
      if (emitted.has(dedupeKey)) continue;
      emitted.add(dedupeKey);
      (context[typeName] ??= {})[defName] = convertDefine(member, story, OWN_FIELDS[typeName]);
    }
  }
  applyBuiltinDefaults(context);
  listAnimationKeyframes(context);
  return context;
}
