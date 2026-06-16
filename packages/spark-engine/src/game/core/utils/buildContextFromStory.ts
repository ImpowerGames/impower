import { InkList, Story } from "@impower/sparkdown/src/inkjs/engine/Story";

// Convert Luau runtime `__def` tables (the source of truth for authored
// `define`s) into the plain-JS `{ type: { name: struct } }` shape the engine's
// modules expect from `program.context`.
//
// A define is a runtime ObjectValue (its `.value` is a `Map<string,
// AbstractValue>`) tagged on its metatable (see StdLib `__def`):
//   __define       — the define's own name
//   __defineParent — the parent type's name ("" / absent for a root define)
//   __index        — the parent type TABLE (inheritance chain)
// Instances are also registered INTO their parent + every ancestor type table,
// so a type table's `.value` map holds both its real props AND its registered
// instances (each instance is itself a define table — skipped when collecting
// props).
//
// NOTE: builtin `$default`s (e.g. `animation`'s default `timing`) are NOT
// runtime defines — they live in the engine's DEFAULT_BUILTIN_DEFINITIONS and
// are merged in by `Game.rebuildContext`. This converter only produces the
// AUTHORED-define layer. Likewise it is intentionally RICHER than the lossy
// compile-time `program.context` (which omits computed/non-scalar props that
// had no faithful literal form); the runtime table carries the real values.

const DEFINE_MARKER = "__define";
const DEFINE_PARENT_MARKER = "__defineParent";
const INDEX_MARKER = "__index";

/** Hidden keys on a define table that are never real properties. */
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

/** The metatable's backing map (or null) for a runtime ObjectValue. */
function metatableMap(v: AnyVal): Map<string, AnyVal> | null {
  const mt = v?.metatable;
  return mt ? asMap(mt.value) : null;
}

function isDefineTable(v: AnyVal): boolean {
  return metatableMap(v)?.get(DEFINE_MARKER) != null;
}

/** A method value: an ObjectValue whose map carries a hoisted closure. */
function isClosureMap(map: Map<string, AnyVal>): boolean {
  return map.has("__closure_fn");
}

function metaString(v: AnyVal, key: string): string {
  const entry = metatableMap(v)?.get(key);
  return entry != null && "value" in entry ? String(entry.value) : "";
}

/** Walk a define's `__index` chain, self first then ancestors (mirrors
 *  StdLib.defineChain). */
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

/** Deep-merge `override` onto `base`: override wins, base fills gaps, nested
 *  plain objects merge recursively, arrays/scalars replace wholesale. Matches
 *  SparkdownCompiler.inheritDefaults so runtime inheritance produces the same
 *  flattened view the compile-time `$default` merge did. */
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

/** Mirror Game.getRuntimeValue's InkList handling so list values convert
 *  identically wherever they appear. */
function convertInkList(valueObj: AnyVal, story: Story): unknown {
  const list = valueObj.value as InkList;
  // GetVariableWithName has no name here; the def lookup keys off the list's
  // own origin, so try the first item's origin name.
  const listValue: Record<string, unknown> = { $type: "list.var" };
  for (const [key, value] of list.entries()) {
    const keyObj = JSON.parse(key) as { originName: string; itemName: string };
    listValue[keyObj.originName + "." + keyObj.itemName] = value;
  }
  return listValue;
}

/** Convert any runtime AbstractValue to plain JS (undefined = omit). */
function convertValue(v: AnyVal, story: Story): unknown {
  if (v == null) return undefined;
  if (!("value" in v)) return undefined; // NullValue and friends
  const inner = v.value;
  if (inner instanceof InkList) return convertInkList(v, story);
  const map = asMap(inner);
  if (map) return convertTable(map, story);
  return inner; // scalar (number | string | boolean)
}

/** Convert a plain runtime table (Map) to a JS array or object. Numeric
 *  "1".."n" keys → array (mirrors lowerTable / expressionToContextValue);
 *  otherwise an object. Skips meta keys and method closures. */
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
    if (valMap && isClosureMap(valMap)) continue; // method
    const cv = convertValue(val, story);
    if (cv !== undefined) obj[k] = cv;
  }
  return obj;
}

/** Collect one chain level's OWN property values, skipping meta keys, methods,
 *  and registered instances (which live in a type table's map but are siblings,
 *  not properties). */
function collectLevelProps(
  levelMap: Map<string, AnyVal>,
  story: Story,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, val] of levelMap) {
    if (META_PROP_KEYS.has(k)) continue;
    if (isDefineTable(val)) continue; // a registered instance, not a prop
    const valMap = asMap(val?.value);
    if (valMap && isClosureMap(valMap)) continue; // method
    const cv = convertValue(val, story);
    if (cv !== undefined) out[k] = cv;
  }
  return out;
}

/** Convert a single define table to its flattened JS struct (inheritance
 *  applied, `$type`/`$name` attached). */
export function convertDefine(
  defineTable: AnyVal,
  story: Story,
): Record<string, unknown> {
  const chain = defineChain(defineTable);
  let merged: Record<string, unknown> = {};
  // Root-most first so more-derived levels override (child wins).
  for (let i = chain.length - 1; i >= 0; i -= 1) {
    const levelMap = asMap(chain[i].value);
    if (!levelMap) continue;
    merged = deepMerge(merged, collectLevelProps(levelMap, story));
  }
  merged["$type"] = metaString(defineTable, DEFINE_PARENT_MARKER);
  merged["$name"] = metaString(defineTable, DEFINE_MARKER);
  return merged;
}

/** Build the `{ type: { name: struct } }` context view of every AUTHORED
 *  define currently present in the story's runtime globals.
 *
 *  Only INSTANCE tables (those with a `__defineParent`) are emitted, under
 *  `context[parentType][name]` — matching `program.context`. Pure type-namespace
 *  tables (implicit parents like `animation`, which carry only registered
 *  instances) are skipped. A define registered under multiple ancestors is
 *  emitted under each ancestor type so `context.character.O` and
 *  `context.companion.O` both resolve. */
export function buildDefinesContext(
  story: Story,
): Record<string, Record<string, unknown>> {
  const context: Record<string, Record<string, unknown>> = {};
  const variablesState = story?.state?.variablesState as AnyVal;
  const globals = variablesState?.["_globalVariables"] as
    | Map<string, AnyVal>
    | undefined;
  if (!globals) return context;

  for (const name of globals.keys()) {
    const valueObj = variablesState.GetVariableWithName(name);
    if (!isDefineTable(valueObj)) continue;
    const parent = metaString(valueObj, DEFINE_PARENT_MARKER);
    if (!parent) continue; // root type-namespace table — not a context entry
    const struct = convertDefine(valueObj, story);
    const defName = metaString(valueObj, DEFINE_MARKER);

    // Emit under the immediate parent type AND every ancestor type, mirroring
    // __def's multi-ancestor registration.
    const chain = defineChain(valueObj);
    const ancestorTypes = new Set<string>([parent]);
    for (const level of chain) {
      const levelName = metaString(level, DEFINE_MARKER);
      if (levelName && levelName !== defName) {
        ancestorTypes.add(levelName);
      }
    }
    for (const type of ancestorTypes) {
      (context[type] ??= {})[defName] = struct;
    }
  }
  return context;
}
