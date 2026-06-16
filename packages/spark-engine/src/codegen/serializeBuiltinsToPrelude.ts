// One-time codegen: serialize the JS `DEFAULT_BUILTIN_DEFINITIONS` struct map
// into a sparkdown `builtins.sd` prelude of `define` statements. Compiling the
// prelude reproduces today's `program.context` builtins (for the LSP) AND seeds
// the runtime `__def` tables (so the engine can read builtins from the runtime).
//
// Mapping (verified against the compiler):
//   defs[type][name]  → `define <name> as <type> with <props> end`
//   defs.config.ui    → `define ui as config with <props> end`  (→ context.config.ui)
//   type defaults     → name is `$default`                       (→ context.<type>.$default)
//
// Value forms:
//   string                       → "..."         (quoted, escaped)
//   number / boolean             → literal
//   { $type, $name } (only)      → bare ref `name` / typed ref `type.name`
//   array (JS Array)             → { a, b, c }
//   object                       → { k = v, ... }
//   non-identifier key           → ["the key"] = ...

/* eslint-disable @typescript-eslint/no-explicit-any */

const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

// Reserved words that look like identifiers but can't be a bare property key
// in a define body (the grammar would parse them as keywords — e.g. `function`
// starts a method, `end` closes the block). Serialize these as bracket-keys.
// Covers Luau keywords + sparkdown-reserved words (see Story.IsReservedKeyword).
const RESERVED_KEYS = new Set<string>([
  "and", "break", "do", "else", "elseif", "end", "false", "for", "function",
  "if", "in", "local", "nil", "not", "or", "repeat", "return", "then", "true",
  "until", "while",
  "temp", "store", "var", "const", "define", "system", "scene", "branch",
  "none", "include", "external",
]);

function quote(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function serializeKey(k: string): string {
  if (IDENT_RE.test(k) && !RESERVED_KEYS.has(k)) return k;
  return `[${quote(k)}]`;
}

/** True when an object is exactly an inert struct reference `{ $type, $name }`. */
function isStructRef(v: any): boolean {
  if (v == null || typeof v !== "object" || Array.isArray(v)) return false;
  const keys = Object.keys(v);
  return (
    keys.length === 2 &&
    keys.includes("$type") &&
    keys.includes("$name") &&
    typeof v.$name === "string"
  );
}

function serializeValue(v: any): string {
  if (v == null) return "()"; // nil — should be rare; keeps it explicit
  if (typeof v === "string") return quote(v);
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) {
    if (v.length === 0) return "{}";
    return `{ ${v.map(serializeValue).join(", ")} }`;
  }
  if (typeof v === "object") {
    if (isStructRef(v)) {
      const type = String(v.$type ?? "");
      const name = String(v.$name ?? "");
      return type ? `${type}.${name}` : name;
    }
    // Skip only $type/$name (provided by the define header / struct-ref form).
    // Other `$`-keys ($link/$recursive/…) and selector keys (">> *") are
    // emitted via Luau bracket-keys (serializeKey brackets non-identifiers).
    const entries = Object.entries(v).filter(
      ([k]) => k !== "$type" && k !== "$name",
    );
    if (entries.length === 0) return "{}";
    const parts = entries.map(
      ([k, val]) => `${serializeKey(k)} = ${serializeValue(val)}`,
    );
    return `{ ${parts.join(", ")} }`;
  }
  return "()";
}

/** Serialize one `defs[type][name]` struct to a `define ... end` block.
 *  The `$default` entry is the type's defaults → a ROOT define
 *  (`define <type> with ...`), which the compiler records as `context.<type>.
 *  $default` and seeds as the runtime type table (so instances inherit via
 *  `__index`). Named entries are `define <name> as <type> with ...`. */
export function serializeDefine(
  type: string,
  name: string,
  struct: any,
): string {
  const header =
    name === "$default"
      ? `define ${type} with`
      : `define ${serializeKey(name)} as ${type} with`;
  const lines: string[] = [header];
  // Skip only $type/$name (the header provides them). Other `$`-keys
  // ($link/$recursive/…) + selector keys are emitted via bracket-keys.
  const entries = Object.entries(struct ?? {}).filter(
    ([k]) => k !== "$type" && k !== "$name",
  );
  for (const [k, v] of entries) {
    lines.push(`  ${serializeKey(k)} = ${serializeValue(v)}`);
  }
  lines.push("end");
  return lines.join("\n");
}

/** Serialize the whole `{ type: { name: struct } }` builtin map to prelude
 *  source. `$default` entries are emitted first within a type so the type table
 *  exists before its named instances reference it. */
export function serializeBuiltinsToPrelude(
  defs: Record<string, Record<string, any>>,
): string {
  const blocks: string[] = [];
  for (const [type, structs] of Object.entries(defs)) {
    const names = Object.keys(structs);
    names.sort((a, b) => {
      if (a === "$default") return -1;
      if (b === "$default") return 1;
      return 0;
    });
    for (const name of names) {
      // A reserved keyword (e.g. `none`) can't be a `define <name>` — it's a
      // grammar keyword in the name position. `ease.none` / `synth.none` are the
      // only builtins affected; skip them here (TODO: needs a reserved-name
      // escape or engine-side handling — golden-master will show if it matters).
      if (name !== "$default" && RESERVED_KEYS.has(name)) continue;
      blocks.push(serializeDefine(type, name, structs[name]));
    }
  }
  return blocks.join("\n\n") + "\n";
}
