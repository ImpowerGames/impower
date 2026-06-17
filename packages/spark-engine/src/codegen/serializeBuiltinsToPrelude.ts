// One-time codegen: serialize the JS `DEFAULT_BUILTIN_DEFINITIONS` struct map
// into a sparkdown `builtins.sd` prelude. Compiling the prelude reproduces
// today's `program.context` builtins (for the LSP) AND seeds the runtime
// `__def` tables (so the engine can read builtins from the runtime).
//
// Two representations:
//   * Structural UI types (style / screen / component) → their dedicated
//     keyword blocks (`style <name> with <colon/indent body> end`). The
//     colon/indent body keeps CSS selectors / breakpoints / nested element
//     trees in their natural unbracketed form (`>> *:`, `@screen_size(sm):`,
//     `choice 0:`) — matching how authored UI is written and how
//     lowerStructBody parses it. `$default` for these still uses a root define
//     (a `$default` name can't appear after the keyword).
//   * Everything else → `define` blocks:
//       defs[type][name]  → `define <name> as <type> with <props> end`
//       defs.config.ui    → `define ui as config with <props> end`
//       type defaults     → root `define <type> with <props> end`  (→ $default)
//
// `define`-body value forms:
//   string                       → "..."         (quoted, escaped)
//   number / boolean             → literal
//   { $type, $name } (only)      → bare ref `name` / typed ref `type.name`
//   array (JS Array)             → { a, b, c }   (empty → {})
//   object                       → { k = v, ... }
//   non-identifier key           → ["the key"] = ...

/* eslint-disable @typescript-eslint/no-explicit-any */

const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

// UI types authored via dedicated keyword blocks (NOT `define`). Their named
// instances serialize to `<keyword> <name> with <colon/indent body> end`.
const STRUCTURAL_TYPES = new Set<string>(["style", "screen", "component"]);

// Reserved words that look like identifiers but can't be a bare property key
// in a define body (the grammar would parse them as keywords — e.g. `function`
// starts a method, `end` closes the block). Serialize these as bracket-keys.
// Covers Luau keywords + sparkdown-reserved words (see Story.IsReservedKeyword).
// NOTE: `none` is intentionally NOT reserved (only `nil` is the Luau keyword),
// so `ease.none` / `synth.none` serialize + compile normally.
const RESERVED_KEYS = new Set<string>([
  "and", "break", "do", "else", "elseif", "end", "false", "for", "function",
  "if", "in", "local", "nil", "not", "or", "repeat", "return", "then", "true",
  "until", "while",
  "temp", "store", "var", "const", "define", "system", "scene", "branch",
  "include", "external",
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
    if (v.length === 0) return "{}"; // Luau-faithful empty table
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

// ---------------------------------------------------------------------------
// Structural (style / screen / component) keyword serialization.
// ---------------------------------------------------------------------------

/** A scalar value for a colon/indent struct body. Raw (unquoted) when safe so
 *  CSS values stay readable; quoted + escaped when the value would otherwise be
 *  misread by lowerStructBody's line-based parser — a newline (font stacks), an
 *  empty string, leading/trailing whitespace, a trailing `:` (parsed as a
 *  nested-block key), or the literal `true`/`false` (parsed as a boolean).
 *  Numbers are emitted raw and parse back as strings (lowerStructBody keeps CSS
 *  numerics as strings) — only `$recursive`'s boolean needs the keyword form. */
function serializeBodyScalar(v: any): string {
  if (typeof v === "boolean") return String(v); // → boolean via parseScalar
  if (typeof v === "number") return String(v); // → string via parseScalar
  const s = String(v);
  const needsQuote =
    s === "" ||
    s === "true" ||
    s === "false" ||
    /[\n\r\t]/.test(s) ||
    s !== s.trim() ||
    s.endsWith(":");
  if (!needsQuote) return s;
  return (
    '"' +
    s
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "\\r")
      .replace(/\t/g, "\\t") +
    '"'
  );
}

/** Serialize a struct's properties as colon/indent body lines (excluding the
 *  `$type`/`$name` identity keys, which the keyword header provides). Nested
 *  objects become `key:` blocks; selector/breakpoint/`choice N` keys are
 *  written verbatim (their non-identifier form is exactly what lowerStructBody
 *  reads). `indent` is the leading-space width for this level. */
function serializeStructuralBody(struct: any, indent: number): string[] {
  const pad = " ".repeat(indent);
  const lines: string[] = [];
  const entries = Object.entries(struct ?? {}).filter(
    ([k]) => k !== "$type" && k !== "$name",
  );
  for (const [k, v] of entries) {
    if (v != null && typeof v === "object" && !Array.isArray(v)) {
      const inner = serializeStructuralBody(v, indent + 2);
      lines.push(`${pad}${k}:`);
      lines.push(...inner); // empty object → just `key:` (parses to {})
    } else if (Array.isArray(v)) {
      // No arrays occur in builtin structural types; handle defensively.
      lines.push(`${pad}${k}:`);
      for (const item of v) {
        lines.push(`${pad}  - ${serializeBodyScalar(item)}`);
      }
    } else {
      lines.push(`${pad}${k} = ${serializeBodyScalar(v)}`);
    }
  }
  return lines;
}

/** Serialize one structural instance to its keyword block:
 *  `<keyword> <name> with <colon/indent body> end`. */
export function serializeStructural(
  type: string,
  name: string,
  struct: any,
): string {
  const lines: string[] = [`${type} ${name} with`];
  lines.push(...serializeStructuralBody(struct, 2));
  lines.push("end");
  return lines.join("\n");
}

/** Serialize the whole `{ type: { name: struct } }` builtin map to prelude
 *  source. `$default` entries are emitted first within a type so the type table
 *  exists before its named instances reference it. Structural types use their
 *  keyword blocks for named instances; everything else uses `define`. */
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
    const structural = STRUCTURAL_TYPES.has(type);
    for (const name of names) {
      if (name === "$default") {
        // `$default` can't be a name after a structural keyword — always a
        // root define (→ context.<type>.$default + runtime type table).
        blocks.push(serializeDefine(type, name, structs[name]));
      } else if (structural) {
        blocks.push(serializeStructural(type, name, structs[name]));
      } else {
        blocks.push(serializeDefine(type, name, structs[name]));
      }
    }
  }
  return blocks.join("\n\n") + "\n";
}
