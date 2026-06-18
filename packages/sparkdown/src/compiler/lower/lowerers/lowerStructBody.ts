import { type SyntaxNode } from "@lezer/common";
import { LowerContext } from "../context";

// Shared parser for the colon/indent struct body inside a structural
// `style`/`screen`/`component … with … end` block. The grammar classifies
// each body line into a named SHAPE node — `LuauStructScalarProperty`
// (`key = value`), `LuauStructObjectHeader` (`key:` / `> selector:` /
// `@breakpoint:` / `column #gap=16:`), `LuauStructArrayItem` (`- item`),
// `LuauStructAdjacencyContent` (`tag "content"`), or `LuauStructBareMarker`
// (`image` / `mask shadow_1` / `button "Use"`), with a `LuauStructBodyFallback`
// catch-all. This lowerer DISPATCHES on that shape node's NAME and reads each
// line's key/value from the grammar's value tokens — it does NOT re-tokenize
// the raw line text (no `.indexOf("=")` / `.endsWith(":")` / `.startsWith("-")`
// / adjacency regex) to decide what shape a line is (GRAMMAR.md §5):
//
//   position = absolute        → { position: "absolute",
//   @screen-size(sm):              "@screen-size(sm)": { width: "100%" },
//     width = 100%                 "> text": { color: "black" },
//   > text:                        "stage": { backdrop: { image: "black" } } }
//     color = black
//   stage:                     Line shapes:
//     backdrop:                  - LuauStructScalarProperty   → scalar (value coerced)
//       image = "black"          - LuauStructObjectHeader     → nested block (keyed by the header)
//   image                        - LuauStructAdjacencyContent → `tag "content"` scalar
//   mask shadow_1                - LuauStructBareMarker       → `{}` leaf (image / text / mask …)
//                                - LuauStructArrayItem        → array element
//
// REACTIVE ATTRIBUTES: an element line may carry inline `@event=handler` /
// `#prop=value` bindings (`button "Use" @click=x`, `column #gap=16:`). Those are
// reactive and NOT part of the static struct the engine consumes here — the
// reactive AST builder (lowerSparkleBody) reads them instead. This lowerer
// EXCISES their source spans from any text it reads, so `button "Use" @click=x`
// → `button "Use"` and `column #gap=16:` → `column` (the static `context.screen`
// channel stays free of reactive bindings).

interface BodyLine {
  indent: number;
  // The classified shape node (LuauStructScalarProperty / ObjectHeader /
  // ArrayItem / AdjacencyContent / BareMarker / BodyFallback) the grammar
  // captured for this body line.
  shape: SyntaxNode;
  ctx: LowerContext;
}

// The grammar classifies a body line's content into exactly one of these. The
// per-line wrapper is `LuauStructBodyContent`; the shape node is a descendant.
const SHAPE_NAMES: ReadonlySet<string> = new Set([
  "LuauStructScalarProperty",
  "LuauStructArrayItem",
  "LuauStructObjectHeader",
  "LuauStructAdjacencyContent",
  "LuauStructBareMarker",
  "LuauStructBodyFallback",
]);

// The grammar's value tokens a scalar / array-item value lowers from (CSS-like
// tokens, quoted strings, numbers, booleans). Read by name so the lowerer never
// re-splits the raw line on `=`.
const FIELD_VALUE_NAMES: ReadonlySet<string> = new Set([
  "StringFieldValueInterpolated",
  "StringFieldValue",
  "LuauElementContentStringInterpolated",
  "LuauElementContentStringPlain",
  "NumericFieldValue",
  "BooleanFieldValue",
  "StylingValue",
  "UnquotedStringFieldValue",
]);

// The grammar's key tokens for a scalar property (`key = value`).
const KEY_TOKEN_NAMES: ReadonlySet<string> = new Set([
  "BuiltinComponentName",
  "DeclarationScalarPropertyKey",
  "CustomComponentName",
  "PropertyName",
]);

// The element-tag token for an adjacency line (`tag "content"`).
const TAG_TOKEN_NAMES: ReadonlySet<string> = new Set([
  "ComponentName",
  "BuiltinComponentName",
  "CustomComponentName",
]);

export function collectStructBodyLines(
  contentNode: SyntaxNode | null,
  ctx: LowerContext,
): BodyLine[] {
  const lines: BodyLine[] = [];
  if (!contentNode) return lines;
  const walk = (node: SyntaxNode | null) => {
    let child = node?.firstChild ?? null;
    while (child) {
      if (child.name === "LuauStructBodyContent") {
        const shape = firstDescendant(child, SHAPE_NAMES);
        if (shape) {
          // Skip whole-line `--` Luau comments. `style`/`screen`/`component`
          // bodies are Luau contexts (where `//` is floor division, NOT a
          // comment — so `//` is intentionally not treated as a comment here);
          // `--` is the comment marker. A commented-out line classifies as a
          // `LuauStructBareMarker`/fallback (the array-item rule rejects `--`),
          // so it would otherwise leak as a bogus `"-- background_color"` leaf
          // in the generated struct. Only WHOLE-LINE comments are skipped — a
          // mid-line `--` can be part of a value (`var(--theme-…)`), which lives
          // inside a scalar's value node and is left intact.
          const isWholeLineComment = ctx
            .read(shape.from, shape.to)
            .trimStart()
            .startsWith("--");
          if (!isWholeLineComment) {
            lines.push({ indent: ctx.characterNumber(child.from), shape, ctx });
          }
        }
      } else {
        walk(child);
      }
      child = child.nextSibling;
    }
  };
  walk(contentNode);
  return lines;
}

// DFS in-order: the first descendant (or self) whose name is in `names`.
function firstDescendant(
  node: SyntaxNode,
  names: ReadonlySet<string>,
): SyntaxNode | null {
  if (names.has(node.name)) return node;
  let c = node.firstChild;
  while (c) {
    const found = firstDescendant(c, names);
    if (found) return found;
    c = c.nextSibling;
  }
  return null;
}

// Spans of inline element attributes (`@event=…`, `#prop=…`) within a node, in
// source order. Used to excise reactive attributes from the static struct text
// (they are not part of the engine-consumed struct).
function attributeRanges(node: SyntaxNode): { from: number; to: number }[] {
  const ranges: { from: number; to: number }[] = [];
  const walk = (n: SyntaxNode) => {
    let c = n.firstChild;
    while (c) {
      if (c.name === "LuauEventAttribute" || c.name === "LuauPropAttribute") {
        ranges.push({ from: c.from, to: c.to });
      } else {
        walk(c);
      }
      c = c.nextSibling;
    }
  };
  walk(node);
  return ranges;
}

// A node's source text with all inline-attribute spans removed, so the static
// struct sees only the structural part (`column #gap=16` → `column `,
// `button "Use" @click=x` → `button "Use" `).
function textWithoutAttributes(node: SyntaxNode, ctx: LowerContext): string {
  const ranges = attributeRanges(node);
  if (ranges.length === 0) return ctx.read(node.from, node.to);
  let result = "";
  let pos = node.from;
  for (const { from, to } of ranges) {
    if (from > pos) result += ctx.read(pos, from);
    pos = to;
  }
  if (node.to > pos) result += ctx.read(pos, node.to);
  return result;
}

export function parseStructBody(lines: BodyLine[]): Record<string, unknown> {
  const result = parseBlock(lines, 0, lines[0]?.indent ?? 0);
  // A bare body (top-level array) is unusual for UI; coerce to object.
  return Array.isArray(result.value)
    ? { ...result.value }
    : (result.value as Record<string, unknown>);
}

function parseBlock(
  lines: BodyLine[],
  start: number,
  indent: number,
): { value: Record<string, unknown> | unknown[]; next: number } {
  const obj: Record<string, unknown> = {};
  let arr: unknown[] | null = null;
  let i = start;
  while (i < lines.length && lines[i]!.indent >= indent) {
    if (lines[i]!.indent > indent) {
      i += 1; // defensive: skip over-indented orphan
      continue;
    }
    const line = lines[i]!;
    const shape = line.shape;
    const ctx = line.ctx;

    if (shape.name === "LuauStructArrayItem") {
      arr = arr ?? [];
      const childIndent = nextChildIndent(lines, i, indent);
      if (childIndent != null) {
        const sub = parseBlock(lines, i + 1, childIndent);
        arr.push(sub.value);
        i = sub.next;
      } else {
        const valueNode = firstDescendant(shape, FIELD_VALUE_NAMES);
        if (valueNode) arr.push(parseScalar(readValue(valueNode, ctx)));
        i += 1;
      }
    } else if (shape.name === "LuauStructObjectHeader") {
      // Nested block — covers `key:`, `> selector:`, `@breakpoint:`, and an
      // element header with inline attributes (`column #gap=16:`). The key is
      // the header text before the `:`, with any `@event`/`#prop` attributes
      // excised so the static struct keys on the structural part only.
      const key = headerKey(shape, ctx);
      const childIndent = nextChildIndent(lines, i, indent);
      if (childIndent != null) {
        const sub = parseBlock(lines, i + 1, childIndent);
        obj[key] = sub.value;
        i = sub.next;
      } else {
        obj[key] = {};
        i += 1;
      }
    } else if (shape.name === "LuauStructScalarProperty") {
      // `key = value` → scalar. Key + value read from the grammar tokens.
      const keyNode = firstDescendant(shape, KEY_TOKEN_NAMES);
      const valueNode = firstDescendant(shape, FIELD_VALUE_NAMES);
      const key = keyNode ? ctx.read(keyNode.from, keyNode.to).trim() : "";
      if (key) obj[key] = parseScalar(valueNode ? readValue(valueNode, ctx) : "");
      i += 1;
    } else if (shape.name === "LuauStructAdjacencyContent") {
      // Adjacency content `tag "content"` (spec §4.2) → { tag: content },
      // identical to the `tag = "content"` scalar form. Tag + content read from
      // the grammar tokens; trailing `@event`/`#prop` attributes are NOT in the
      // tag/content nodes, so the static struct is attribute-free.
      const tagNode = firstDescendant(shape, TAG_TOKEN_NAMES);
      const valueNode = firstDescendant(shape, FIELD_VALUE_NAMES);
      const tag = tagNode ? ctx.read(tagNode.from, tagNode.to).trim() : "";
      if (tag) obj[tag] = parseScalar(valueNode ? readValue(valueNode, ctx) : "");
      i += 1;
    } else {
      // LuauStructBareMarker / LuauStructBodyFallback — a `{}` leaf
      // (image / text / mask shadow_1). The marker text is the shape's source
      // with inline attributes excised (`button "Use" @click=x` → `button "Use"`).
      const marker = textWithoutAttributes(shape, ctx).trim();
      if (marker) obj[marker] = {};
      i += 1;
    }
  }
  return { value: arr ?? obj, next: i };
}

// The text of a `key:` object-header key (everything before the colon, with
// inline `@event`/`#prop` attributes excised). The colon lives in its own
// `LuauStructObjectColon` node, so strip a trailing one defensively too.
function headerKey(shape: SyntaxNode, ctx: LowerContext): string {
  return textWithoutAttributes(shape, ctx)
    .trim()
    .replace(/:\s*$/, "")
    .trim();
}

// Read a value node's text. Interpolation-aware content strings and plain
// content strings keep their surrounding quotes here so `parseScalar` (the
// shared value coercion) strips them and processes escapes uniformly; all other
// value tokens (numbers, CSS funcs, struct refs) come through as raw text.
function readValue(value: SyntaxNode, ctx: LowerContext): string {
  return ctx.read(value.from, value.to).trim();
}

// Indent of the first child line below line `i`, or null if line `i` is a
// leaf (no deeper-indented line follows before a dedent).
function nextChildIndent(
  lines: BodyLine[],
  i: number,
  indent: number,
): number | null {
  const next = lines[i + 1];
  if (next && next.indent > indent) return next.indent;
  return null;
}

// A two-part struct reference: `<type>.<name>` where BOTH parts are bare
// identifiers (e.g. `image.ui_dialogue_box`, `font.courier_prime_sans`).
// Anchored + identifier-only so it never matches numbers (`1.5`), units
// (`0.5cqh`), ratios (`1341/381`), or CSS functions (`translateY(-100%)`).
const STRUCT_REFERENCE_RE =
  /^([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)$/;

// Scalar value coercion (operates on a value string isolated from the grammar's
// value node): strip surrounding quotes for strings; resolve a bare
// `<type>.<name>` reference to a `{ $type, $name }` struct reference
// (mirroring the legacy colon-form's `StructPropertyDefinition.GetValue` and
// the OOP-define path). The style→CSS transformer turns `{ $type, $name }`
// into `var(--theme-<type>-<name>)`; a raw `"image.ui_dialogue_box"` string
// would instead become the invalid `var(--theme-image-image.ui_dialogue_box)`,
// so backgrounds/fonts referenced in `style`/`screen`/`component` bodies
// silently fail to render. Everything else (numbers, percentages, CSS funcs,
// plain keywords like `black` / `absolute`) is kept as a raw string.
function parseScalar(raw: string): unknown {
  const s = raw.trim();
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    // Quoted string literal: strip quotes and process escapes. The line-based
    // body can't carry a literal newline, so multi-line values (e.g. a CSS
    // `font_family` stack) are written on one line with `\n` escapes; unescape
    // them here so the value round-trips. Mirrors lowerExpression's string
    // escape handling.
    return unescapeString(s.slice(1, -1));
  }
  // `true` / `false` parse to booleans (Luau keywords). No CSS value is the
  // bare word `true`/`false`, so this is safe — and lets `$recursive = true`
  // round-trip as a boolean rather than the string "true".
  if (s === "true") {
    return true;
  }
  if (s === "false") {
    return false;
  }
  const ref = STRUCT_REFERENCE_RE.exec(s);
  if (ref) {
    return { $type: ref[1], $name: ref[2] };
  }
  return s;
}

function unescapeString(s: string): string {
  return s.replace(/\\(.)/g, (_m, c: string) => {
    switch (c) {
      case "n":
        return "\n";
      case "r":
        return "\r";
      case "t":
        return "\t";
      case "b":
        return "\b";
      case "f":
        return "\f";
      case "v":
        return "\v";
      case "0":
        return "\0";
      default:
        return c; // \\  \"  and any other escaped char → the literal char
    }
  });
}
