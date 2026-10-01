import GRAMMAR_DEFINITION from "../../../../language/sparkdown.language-grammar.json";
import { nodeNameSet } from "../../utils/nodeNameSet";
import { type SyntaxNode } from "@lezer/common";
import type { LowerContext } from "../context";
import {
  UNQUOTED_VALUE_NODES,
  stripTrailingLineComment,
} from "../utils/stripTrailingLineComment";
import {
  readStructBodyEntries,
  type StructEntry,
  type StructEntryKind,
} from "../utils/structBodyEntries";
import {
  sparkleClosureAttributeEnd,
  sparkleElementParts,
  sparklePartNodes,
} from "../utils/sparkleBlockEntries";
import { unescapeString } from "../utils/unescapeString";
import { warnValueItemWithEntries } from "../utils/warnValueItemWithEntries";

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
// A `style` body may also be written with brace blocks (`&.secondary { … }`,
// `@hovered, @pressed { … }`). The body is read as the entry tree of
// `readStructBodyEntries`, which gives the indented lines (including a
// collapsed `- label:` list item) and the braced entries the same entries, so
// both forms lower to the same struct. A `layout` or `component` body's brace
// blocks (`row.item { … }`) are placed where the indented form of the same
// body places its lines, and an element in one is keyed as the same element
// on an indented line is (`evaluateElement`). A brace leaf is adjacency
// content when the grammar's `LuauStructAdjacencyContent` pattern, taken from
// the generated grammar rather than restated here, matches its text.
//
// REACTIVE ATTRIBUTES: an element line may carry inline `@event=handler` /
// `#prop=value` bindings (`button "Use" @click=x`, `column #gap=16:`). Those are
// reactive and NOT part of the static struct the engine consumes here — the
// reactive AST builder (lowerSparkleBody) reads them instead. This lowerer
// EXCISES their source spans from any text it reads, so `button "Use" @click=x`
// → `button "Use"` and `column #gap=16:` → `column` (the static `context.layout`
// channel stays free of reactive bindings).

// The grammar classifies a body line's content into exactly one of these. The
// per-line wrapper is `LuauStructBodyContent`; the shape node is a descendant.
const SHAPE_NAMES: ReadonlySet<string> = nodeNameSet([
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
const FIELD_VALUE_NAMES: ReadonlySet<string> = nodeNameSet([
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
const KEY_TOKEN_NAMES: ReadonlySet<string> = nodeNameSet([
  "BuiltinComponentName",
  "DeclarationScalarPropertyKey",
  "CustomComponentName",
  "PropertyName",
]);

// The element-tag token for an adjacency line (`tag "content"`).
const TAG_TOKEN_NAMES: ReadonlySet<string> = nodeNameSet([
  "ComponentName",
  "BuiltinComponentName",
  "CustomComponentName",
]);

/** The entries of a struct body, in the indented and the braced form alike. */
export function collectStructBodyLines(
  contentNode: SyntaxNode | null,
  ctx: LowerContext,
): StructEntry[] {
  return readStructBodyEntries(contentNode, ctx, (content) =>
    classifyLine(content, ctx),
  );
}

// How an indented line reads: the grammar's shape for it, or none.
function classifyLine(
  content: SyntaxNode,
  ctx: LowerContext,
): { kind: StructEntryKind; shape: SyntaxNode } | null {
  const shape = firstDescendant(content, SHAPE_NAMES);
  if (!shape) return null;
  // Skip whole-line `--` Luau comments. `style`/`screen`/`component` bodies
  // are Luau contexts (where `//` is floor division, NOT a comment — so `//`
  // is intentionally not treated as a comment here); `--` is the comment
  // marker. A commented-out line classifies as a
  // `LuauStructBareMarker`/fallback (the array-item rule rejects `--`), so it
  // would otherwise leak as a bogus `"-- background_color"` leaf in the
  // generated struct. Only WHOLE-LINE comments are skipped — a mid-line `--`
  // can be part of a value (`var(--theme-…)`), which lives inside a scalar's
  // value node and is left intact.
  if (ctx.read(shape.from, shape.to).trimStart().startsWith("--")) {
    return null;
  }
  switch (shape.name) {
    case "LuauStructArrayItem":
      return { kind: "item", shape };
    case "LuauStructObjectHeader":
      return { kind: "header", shape };
    case "LuauStructScalarProperty":
      return { kind: "property", shape };
    default:
      return { kind: "other", shape };
  }
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

const ATTRIBUTE_NAMES: ReadonlySet<string> = nodeNameSet([
  "LuauEventAttribute",
  "LuauPropAttribute",
  "LuauSparkleEventAttribute",
  "LuauSparklePropAttribute",
  "LuauSparkleEventClosureAttribute",
]);

// Spans of inline element attributes (`@event=…`, `#prop=…`) within a node, in
// source order. Used to excise reactive attributes from the static struct text
// (they are not part of the engine-consumed struct).
function attributeRanges(node: SyntaxNode): TextEdit[] {
  return nodesOutsideAttributes(node, ATTRIBUTE_NAMES, true);
}

// The nodes named in `names` within `node`, outside its inline attributes (or,
// with `attributes` set, the attributes themselves), as spans to remove.
function nodesOutsideAttributes(
  node: SyntaxNode,
  names: ReadonlySet<string>,
  attributes = false,
): TextEdit[] {
  const ranges: TextEdit[] = [];
  const walk = (n: SyntaxNode) => {
    let c = n.firstChild;
    while (c) {
      if (ATTRIBUTE_NAMES.has(c.name)) {
        if (attributes) ranges.push({ from: c.from, to: c.to, text: "" });
      } else if (!attributes && names.has(c.name)) {
        ranges.push({ from: c.from, to: c.to, text: "" });
      } else {
        walk(c);
      }
      c = c.nextSibling;
    }
  };
  walk(node);
  return ranges;
}

// The `.` of each `.name` class in an element's key, outside its attributes.
// In a layout or component body the static struct keys an element by its tag
// and classes separated by spaces (`mask.shadow_1` is keyed `mask shadow_1`,
// as `mask shadow_1` is), because the engine splits struct paths on `.`. A
// `.` the key already has whitespace before (`choice .0`) is dropped, so
// the key is `choice 0` either way.
function classDots(node: SyntaxNode): TextEdit[] {
  return nodesOutsideAttributes(node, CLASS_DOT_NAMES).map((r) => ({
    ...r,
    separator: true,
  }));
}

const CLASS_DOT_NAMES: ReadonlySet<string> = nodeNameSet(["LuauSparkleClassDot"]);

// A node's source text with all inline-attribute spans removed, so the static
// struct sees only the structural part (`column #gap=16` → `column `,
// `button "Use" @click=x` → `button "Use" `). In a layout or component body
// (`elementKeys`) a class's `.` reads as a space.
function textWithoutAttributes(
  node: SyntaxNode,
  ctx: LowerContext,
  elementKeys = false,
): string {
  return textExcluding(node, ctx, [
    ...attributeRanges(node),
    ...(elementKeys ? classDots(node) : []),
  ]);
}

/** A span of source text to replace. */
interface TextEdit {
  from: number;
  to: number;
  /** What the span reads as; removed when empty. */
  text?: string;
  /** The span reads as one space, or as nothing after whitespace. */
  separator?: boolean;
}

// A node's source text with the given spans replaced (sorted defensively,
// since callers may concatenate ranges from more than one source).
function textExcluding(
  node: SyntaxNode,
  ctx: LowerContext,
  ranges: TextEdit[],
  to: number = node.to,
): string {
  if (ranges.length === 0) return ctx.read(node.from, to);
  const sorted = [...ranges].sort((a, b) => a.from - b.from);
  let result = "";
  let pos = node.from;
  for (const { from, to: end, text, separator } of sorted) {
    if (from > pos) result += ctx.read(pos, from);
    if (from >= pos && separator) {
      if (result && !/\s$/.test(result)) result += " ";
    } else if (from >= pos && text) result += text;
    pos = Math.max(pos, end);
  }
  if (to > pos) result += ctx.read(pos, to);
  return result;
}

export interface StructBodyOptions {
  /**
   * The body is a `layout` or `component` body, whose elements are keyed by
   * their tag and classes separated by spaces.
   */
  elementKeys?: boolean;
}

export function parseStructBody(
  entries: StructEntry[],
  ctx: LowerContext,
  options: StructBodyOptions = {},
): Record<string, unknown> {
  const result = evaluate(entries, ctx, !!options.elementKeys);
  // A bare body (top-level array) is unusual for UI; coerce to object.
  return Array.isArray(result) ? { ...result } : result;
}

// The grammar's own pattern for an indented adjacency-content line
// (`LuauStructAdjacencyContent`: a name, whitespace, a double-quoted string and
// anything after it), anchored to the start of the text it is tried on. A
// brace leaf whose text it matches is keyed as that indented line is, so the
// two forms cannot drift apart when the grammar rule changes.
const ADJACENCY_CONTENT = new RegExp(
  `^(?:${GRAMMAR_DEFINITION.repository.LuauStructAdjacencyContent.match})`,
);

// Comments in an element's head, which are no part of its key.
const COMMENT_NAMES: ReadonlySet<string> = nodeNameSet([
  "LuauLineComment",
  "LuauBlockComment",
  "LuauDocLineComment",
  "LuauStructBlockSlashComment",
]);

// A piece of an element's text: the source from `node.from` to `to`, read
// with `edits` applied.
interface ElementSegment {
  node: SyntaxNode;
  to: number;
  edits: TextEdit[];
  /** The node the value is looked for in, if any. */
  value: SyntaxNode | null;
}

// An event closure that goes on at the next line, which a segment's text
// never holds: it is an attribute, and it spans lines.
const CLOSURE_ATTRIBUTE = "LuauSparkleEventClosureAttribute";

// Segments read as one line. Segments that follow one another directly are
// one run, read as one range with all their edits, so an element written on
// one line reads exactly as its own text did; runs are joined with a space.
function joinSegments(
  segments: ElementSegment[],
  read: (from: SyntaxNode, edits: TextEdit[], to: number) => string,
): string {
  const runs: ElementSegment[][] = [];
  for (const segment of segments) {
    const run = runs[runs.length - 1];
    const last = run?.[run.length - 1];
    if (run && last && segment.node.from === last.to) run.push(segment);
    else runs.push([segment]);
  }
  return runs
    .map((run) =>
      read(
        run[0]!.node,
        run.flatMap((s) => s.edits),
        run[run.length - 1]!.to,
      ),
    )
    .join(" ");
}

// The segments of an element's text, in source order: a brace element's name
// and arguments, its head and the runs of parts and event closures after it,
// or an indented line's shape; then the parts of the continuation lines it
// takes (#1225). Joined (`joinSegments`) they read as the one-line element.
function elementSegments(entry: StructEntry): ElementSegment[] {
  const part = (node: SyntaxNode): ElementSegment =>
    node.name === CLOSURE_ATTRIBUTE
      ? // The closure alone: the run of parts after its `}` follows it as a
        // segment of its own.
        { node, to: sparkleClosureAttributeEnd(node), edits: [], value: null }
      : {
          node,
          to: node.to,
          edits: [
            ...attributeRanges(node),
            ...nodesOutsideAttributes(node, COMMENT_NAMES),
            ...classDots(node),
          ],
          value: node,
        };
  const segments: ElementSegment[] = [];
  if (entry.element) {
    const element = entry.shape;
    // Its name and a call's arguments, read as written.
    const { beginTo } = sparkleElementParts(element);
    segments.push({ node: element, to: beginTo, edits: [], value: null });
    for (const node of sparklePartNodes(element)) segments.push(part(node));
  } else {
    // An indented line, read as the indented form reads it: its comments stay.
    const shape = entry.shape;
    segments.push({
      node: shape,
      to: shape.to,
      edits: [...attributeRanges(shape), ...classDots(shape)],
      value: shape,
    });
  }
  for (const node of entry.continuations ?? []) segments.push(part(node));
  return segments;
}

// An element in a layout or component brace block, keyed as the same element
// on an indented line is: the line's text up to its block with its attributes
// and comments removed and each class's `.` read as a space. An element with a
// block keys its children by that text, content included
// (`foldout "More" { … }` is keyed `foldout "More"`, as `foldout "More":` is).
// One without a block is keyed by that text without its content, and its
// content is its value (`text.title "Hi"` is `"text title": "Hi"`). An
// element whose parts go on over later lines (#1225) is keyed as the same
// element written on one line.
function evaluateElement(
  entry: StructEntry,
  obj: Record<string, unknown>,
  ctx: LowerContext,
  elementKeys: boolean,
): void {
  const segments = elementSegments(entry);
  const keyOf = (value: SyntaxNode | null) =>
    oneSpace(
      joinSegments(
        segments.filter((s) => s.node.name !== CLOSURE_ATTRIBUTE),
        (node, edits, to) =>
          textExcluding(
            node,
            ctx,
            value && value.from >= node.from && value.to <= to
              ? [...edits, { from: value.from, to: value.to }]
              : edits,
            to,
          ),
      ),
    );
  if (entry.kind === "header") {
    obj[keyOf(null)] = entry.children
      ? evaluate(entry.children, ctx, elementKeys)
      : {};
    return;
  }
  // The value is found as on an indented line, attributes included, so a
  // quoted `#prop` value before any content is the value there too
  // (`loading_fill #transform="scaleX({p})"` is keyed `loading_fill` with
  // that string).
  let valueNode: SyntaxNode | null = null;
  for (const segment of segments) {
    if (valueNode) break;
    if (segment.value && segment.node.name !== CLOSURE_ATTRIBUTE) {
      valueNode = firstDescendant(segment.value, FIELD_VALUE_NAMES);
    }
  }
  // An indented `name "content" …` line is adjacency content
  // (`LuauStructAdjacencyContent`): keyed by its name alone and valued by
  // that first string, whatever follows it (`text "a" "b"` is `text: "a"`).
  // The same element in a block is keyed alike, decided by the grammar's own
  // pattern for that line. An element written over several lines is tried as
  // the one line its segments make.
  const adjacency = ADJACENCY_CONTENT.exec(
    joinSegments(segments, (node, _edits, to) =>
      ctx.read(node.from, to).replace(/[\r\n]/g, " "),
    ),
  );
  if (adjacency) {
    obj[adjacency[2]!] = parseScalar(adjacency[4]!);
    return;
  }
  const key = keyOf(valueNode);
  if (!key) return;
  obj[key] = valueNode ? parseScalar(readValue(valueNode, ctx)) : {};
}

function evaluate(
  entries: StructEntry[],
  ctx: LowerContext,
  elementKeys: boolean,
): Record<string, unknown> | unknown[] {
  const obj: Record<string, unknown> = {};
  let arr: unknown[] | null = null;
  for (const entry of entries) {
    const shape = entry.shape;

    if (entry.element || entry.continuations) {
      evaluateElement(entry, obj, ctx, elementKeys);
    } else if (entry.kind === "item") {
      // Entries beneath the item (indented, carried on the dash line, or
      // inside a bare `{ … }`) → object; a value → scalar.
      arr = arr ?? [];
      if (entry.children) {
        if (!entry.braced) warnValueItemWithEntries(shape, ctx);
        arr.push(evaluate(entry.children, ctx, elementKeys));
      } else {
        const valueNode = firstDescendant(shape, FIELD_VALUE_NAMES);
        if (valueNode) arr.push(parseScalar(readValue(valueNode, ctx)));
      }
    } else if (entry.kind === "header") {
      // Nested block — covers `key:`, `> selector:`, `@breakpoint:`, an element
      // header with inline attributes (`column #gap=16:`), and their `{ … }`
      // forms. The key is the header text before the `:` or `{`, with any
      // `@event`/`#prop` attributes excised so the static struct keys on the
      // structural part only.
      const key = entry.key
        ? textWithoutAttributes(entry.key, ctx).trim()
        : headerKey(shape, ctx, elementKeys);
      obj[key] = entry.children
        ? evaluate(entry.children, ctx, elementKeys)
        : {};
    } else if (entry.kind === "property") {
      // `key = value` → scalar. Key + value read from the grammar tokens.
      const keyNode = firstDescendant(shape, KEY_TOKEN_NAMES);
      const valueNode = firstDescendant(shape, FIELD_VALUE_NAMES);
      const key = keyNode ? ctx.read(keyNode.from, keyNode.to).trim() : "";
      if (key) obj[key] = parseScalar(valueNode ? readValue(valueNode, ctx) : "");
    } else if (shape.name === "LuauStructAdjacencyContent") {
      // Adjacency content `tag "content"` (spec §4.2) → { tag: content },
      // identical to the `tag = "content"` scalar form. Tag + content read from
      // the grammar tokens; trailing `@event`/`#prop` attributes are NOT in the
      // tag/content nodes, so the static struct is attribute-free.
      const tagNode = firstDescendant(shape, TAG_TOKEN_NAMES);
      const valueNode = firstDescendant(shape, FIELD_VALUE_NAMES);
      const tag = tagNode ? ctx.read(tagNode.from, tagNode.to).trim() : "";
      if (tag) obj[tag] = parseScalar(valueNode ? readValue(valueNode, ctx) : "");
    } else {
      // LuauStructBareMarker / LuauStructBodyFallback. Two shapes land here:
      //
      //   `image`, `mask shadow_1` — a genuinely content-less leaf → `{}`.
      //   `text h1 "Sparkle x Pico"` — an element carrying BOTH style classes and
      //       content. The adjacency rule only matches ONE tag token before the
      //       string, so a classed line falls through to this fallback.
      //
      // Lower that second form the way the adjacency branch lowers the class-less
      // `text "HP: {hp}"` — key = tag + classes, value = the content — rather than
      // stuffing the whole line into the key with an empty value. The empty-value
      // form is load-bearing downstream: UIModule.initLayout reads an empty
      // `text`/`image` leaf as an unwritten WRITE TARGET and registers its PARENT
      // as a clear-on-continue transient, so the old shape made the engine hide an
      // authored container (`column`) merely for holding a styled static text.
      //
      // The marker text is the shape's source with inline attributes excised
      // (`button "Use" @click=x` → `button "Use"`), and now the content span too.
      const valueNode = firstDescendant(shape, FIELD_VALUE_NAMES);
      const marker = (
        valueNode
          ? textExcluding(shape, ctx, [
              ...attributeRanges(shape),
              ...(elementKeys ? classDots(shape) : []),
              { from: valueNode.from, to: valueNode.to },
            ])
          : textWithoutAttributes(shape, ctx, elementKeys)
      ).trim();
      const key = elementKeys ? oneSpace(marker) : marker;
      if (key) {
        obj[key] = valueNode ? parseScalar(readValue(valueNode, ctx)) : {};
      }
    }
  }
  return arr ?? obj;
}

// The text of a `key:` object-header key (everything before the colon, with
// inline `@event`/`#prop` attributes excised). The colon lives in its own
// `LuauStructObjectColon` node, so strip a trailing one defensively too.
function headerKey(
  shape: SyntaxNode,
  ctx: LowerContext,
  elementKeys: boolean,
): string {
  const key = textWithoutAttributes(shape, ctx, elementKeys)
    .trim()
    .replace(/:\s*$/, "")
    .trim();
  return elementKeys ? oneSpace(key) : key;
}

// An element's key in a layout or component body with each run of spaces and
// tabs outside a quoted run read as one space, and trimmed, so removing an
// attribute, a comment or a class's `.` never leaves two spaces between its
// parts (`image @click=go .b` and `choice .0` are keyed `image b` and
// `choice 0`, as `image.b @click=go` and `choice.0` are). The engine splits
// element keys on single spaces.
function oneSpace(key: string): string {
  let out = "";
  let quote = "";
  for (let i = 0; i < key.length; i++) {
    const c = key[i]!;
    if (quote) {
      out += c;
      if (c === "\\" && i + 1 < key.length) out += key[++i];
      else if (c === quote) quote = "";
    } else if (c === '"' || c === "'") {
      quote = c;
      out += c;
    } else if (c === " " || c === "\t") {
      if (!out.endsWith(" ")) out += " ";
    } else {
      out += c;
    }
  }
  return out.trim();
}

// Read a value node's text. Interpolation-aware content strings and plain
// content strings keep their surrounding quotes here so `parseScalar` (the
// shared value coercion) strips them and processes escapes uniformly; all other
// value tokens (numbers, CSS funcs, struct refs) come through as raw text.
function readValue(value: SyntaxNode, ctx: LowerContext): string {
  const text = ctx.read(value.from, value.to).trim();
  // Unquoted value tokens greedily include any trailing `--`/`//` comment; drop
  // it so it never leaks into the value. Quoted tokens are left intact.
  return UNQUOTED_VALUE_NODES.has(value.name)
    ? stripTrailingLineComment(text)
    : text;
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

