import { type SyntaxNode } from "@lezer/common";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { LowerContext } from "../context";

// Shared parser for the colon/indent struct body inside a structural
// `style`/`screen`/`component … with … end` block. The grammar classifies
// each body line's content into a named SHAPE node — `LuauStructScalarProperty`
// (`key = value`), `LuauStructObjectHeader` (`key:` / `> selector:` /
// `@breakpoint:`), `LuauStructArrayItem` (`- item`), or `LuauStructBareMarker`
// (`image` / `mask shadow_1`). This lowerer reads those nodes directly and
// reconstructs the nested struct the engine consumes from each line's
// indentation column — it does NOT re-tokenize the raw line text to decide
// what shape it is (GRAMMAR.md §5):
//
//   position = absolute        → { position: "absolute",
//   @screen-size(sm):              "@screen-size(sm)": { width: "100%" },
//     width = 100%                 "> text": { color: "black" },
//   > text:                        "stage": { backdrop: { image: "black" } } }
//     color = black
//   stage:                     Line shapes:
//     backdrop:                  - LuauStructScalarProperty → scalar (value coerced)
//       image = "black"          - LuauStructObjectHeader   → nested block (keyed by the key node)
//   image                        - LuauStructBareMarker     → `{}` leaf (image / text / mask …)
//   mask shadow_1                - LuauStructArrayItem      → array element

interface BodyLine {
  indent: number;
  // The classified shape node (LuauStructScalarProperty / ObjectHeader /
  // ArrayItem / BareMarker) captured by the grammar for this body line.
  shape: SyntaxNode;
  ctx: LowerContext;
}

// The grammar classifies a body line's content into exactly one of these.
const SHAPE_NAMES: ReadonlySet<string> = new Set([
  "LuauStructScalarProperty",
  "LuauStructObjectHeader",
  "LuauStructArrayItem",
  "LuauStructBareMarker",
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
      if (SHAPE_NAMES.has(child.name)) {
        // Skip whole-line `--` Luau comments. `style`/`screen`/`component`
        // bodies are Luau contexts (where `//` is floor division, NOT a
        // comment — so `//` is intentionally not treated as a comment here);
        // `--` is the comment marker. A commented-out line classifies as a
        // `LuauStructBareMarker` (the array-item rule rejects `--`), so it
        // would otherwise leak as a bogus `"-- background_color"` leaf in the
        // generated struct. Only WHOLE-LINE comments are skipped — a mid-line
        // `--` can be part of a value (`var(--theme-…)`), which lives inside a
        // scalar's value node and is left intact.
        const isWholeLineComment =
          child.name === "LuauStructBareMarker" &&
          ctx.read(child.from, child.to).trimStart().startsWith("--");
        if (!isWholeLineComment) {
          lines.push({
            indent: ctx.characterNumber(child.from),
            shape: child,
            ctx,
          });
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
      const valueNode = getDescendent("LuauStructItemValue", shape);
      const itemText = valueNode
        ? ctx.read(valueNode.from, valueNode.to).trim()
        : "";
      const childIndent = nextChildIndent(lines, i, indent);
      if (childIndent != null) {
        const sub = parseBlock(lines, i + 1, childIndent);
        arr.push(sub.value);
        i = sub.next;
      } else {
        if (itemText) arr.push(parseScalar(itemText));
        i += 1;
      }
    } else if (shape.name === "LuauStructObjectHeader") {
      // Nested block — covers `key:`, `> selector:`, `@breakpoint:`.
      const keyNode = getDescendent("LuauStructObjectKey", shape);
      const key = keyNode ? ctx.read(keyNode.from, keyNode.to).trim() : "";
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
      const keyNode = getDescendent("LuauStructPropertyName", shape);
      const valueNode = getDescendent("LuauStructPropertyValue", shape);
      const key = keyNode ? ctx.read(keyNode.from, keyNode.to).trim() : "";
      const value = valueNode ? ctx.read(valueNode.from, valueNode.to).trim() : "";
      obj[key] = parseScalar(value);
      i += 1;
    } else {
      // LuauStructBareMarker — a `{}` leaf (image / text / mask shadow_1).
      const markerNode = getDescendent("LuauStructMarkerName", shape);
      const marker = markerNode
        ? ctx.read(markerNode.from, markerNode.to).trim()
        : ctx.read(shape.from, shape.to).trim();
      obj[marker] = {};
      i += 1;
    }
  }
  return { value: arr ?? obj, next: i };
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

// Scalar VALUE coercion (operates on an already-isolated value string the
// grammar captured): strip surrounding quotes for strings; resolve a bare
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
    return s.slice(1, -1);
  }
  const ref = STRUCT_REFERENCE_RE.exec(s);
  if (ref) {
    return { $type: ref[1], $name: ref[2] };
  }
  return s;
}
