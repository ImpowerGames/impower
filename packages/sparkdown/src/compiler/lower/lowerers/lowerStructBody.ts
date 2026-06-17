import { type SyntaxNode } from "@lezer/common";
import { LowerContext } from "../context";

// Shared parser for the colon/indent struct body inside a structural
// `style`/`screen`/`component … with … end` block. The grammar captures
// each body line opaquely as `LuauStructBodyContent`; here we read those
// lines (with their indentation column) and reconstruct the nested
// struct the engine consumes:
//
//   position = absolute        → { position: "absolute",
//   @screen-size(sm):              "@screen-size(sm)": { width: "100%" },
//     width = 100%                 "> text": { color: "black" },
//   > text:                        "stage": { backdrop: { image: "black" } } }
//     color = black
//   stage:                     Line shapes:
//     backdrop:                  - `key = value`        → scalar (value raw, quotes stripped)
//       image = "black"          - `<anything>:`        → nested block (key = text sans `:`);
//   image                          covers named elements, `> selectors`, `@breakpoints`
//   mask shadow_1                - bare `marker`        → `{}` leaf (image / text / mask …)
//                                - `- item`             → array element

interface BodyLine {
  indent: number;
  text: string;
}

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
        const text = ctx.read(child.from, child.to).trim();
        // Skip whole-line `--` Luau comments. `style`/`screen`/`component`
        // bodies are Luau contexts (where `//` is floor division, NOT a
        // comment — so `//` is intentionally not treated as a comment here);
        // `--` is the comment marker. The grammar captures each body line
        // opaquely, so a comment line like `-- background_color = rgba(...)`
        // would otherwise parse as a bogus `"-- background_color"` property and
        // leak an invalid declaration into the generated CSS. Only WHOLE-LINE
        // comments are skipped — a mid-line `--` can be part of a value
        // (`var(--theme-…)`), so it is left intact.
        if (text && !text.startsWith("--")) {
          lines.push({ indent: ctx.characterNumber(child.from), text });
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
    const text = lines[i]!.text;
    if (text === "-" || text.startsWith("- ")) {
      arr = arr ?? [];
      const itemText = text === "-" ? "" : text.slice(2).trim();
      const childIndent = nextChildIndent(lines, i, indent);
      if (childIndent != null) {
        const sub = parseBlock(lines, i + 1, childIndent);
        arr.push(sub.value);
        i = sub.next;
      } else {
        if (itemText) arr.push(parseScalar(itemText));
        i += 1;
      }
    } else if (text.endsWith(":")) {
      // Nested block — covers `key:`, `> selector:`, `@breakpoint:`.
      const key = text.slice(0, -1).trim();
      const childIndent = nextChildIndent(lines, i, indent);
      if (childIndent != null) {
        const sub = parseBlock(lines, i + 1, childIndent);
        obj[key] = sub.value;
        i = sub.next;
      } else {
        obj[key] = {};
        i += 1;
      }
    } else {
      const eq = text.indexOf("=");
      const adjacency = eq < 0 ? ADJACENCY_CONTENT_RE.exec(text) : null;
      if (eq >= 0) {
        const key = text.slice(0, eq).trim();
        obj[key] = parseScalar(text.slice(eq + 1).trim());
      } else if (adjacency) {
        // Adjacency content `tag "content"` (spec §4.2) → { tag: content },
        // identical to the `tag = "content"` scalar form. Bare markers
        // (`image`, `mask shadow_1`) have no quoted content and fall through.
        obj[adjacency[1]!] = parseScalar(adjacency[2]!);
      } else {
        // bare marker (image / text / mask shadow_1)
        obj[text] = {};
      }
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

// Adjacency element content: `<tag> "quoted content"` (spec §4.2/D2). The tag
// is a bare identifier; the value is a double-quoted string (which may contain
// `{interp}` — kept as raw text in the static struct, like the scalar form).
const ADJACENCY_CONTENT_RE = /^([A-Za-z_][A-Za-z0-9_]*)\s+(".*")$/;

// Scalar value: strip surrounding quotes for strings; resolve a bare
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
