// Inline rich-text markup for text CONTENT, using Unity UI Toolkit's tag
// vocabulary (`<b>`, `<color=…>`, `<size=…>`, `<sprite>`, …).
//
// WHY Unity's vocabulary: the UI is meant to be portable to UI Toolkit, and
// inline styling is the one place that needs new syntax anyway. Reusing UITK's
// documented tag set means a Unity front-end can round-trip our text without a
// translation table.
//
// WHY runs, not tags, on the wire: UI Toolkit's model is a STRING WITH TAGS
// that the renderer parses. That's the wrong boundary for a multi-renderer
// engine — every consumer would need its own parser. So tags are an AUTHORING
// syntax only: this parses them ONCE, here, into runs of `{ text, style }`
// (the same shape the screenplay display path already produces). The web
// renderer turns a run into a span; a Unity renderer re-serializes a run into
// `<b>…</b>` losslessly, because the style vocabulary below is exactly what
// UITK can express.
//
// Styles are emitted as SPARKLE prop names (`text-weight`, `text-color`, …),
// so they flow through the normal style pipeline and pick up theme colors —
// `<color=sky_60>` resolves via `var(--theme-color-sky_60)` just like a style
// block would.
//
// Unrecognized tags are left as literal text (so prose like `5 < 6` or
// `<not-a-tag>` survives), matching UITK's forgiving behaviour. `<noparse>`
// disables parsing for a span of text, which is the documented escape hatch.

export interface RichTextRun {
  text: string;
  /** Sparkle style props for this run. Absent when the run is unstyled. */
  style?: Record<string, string>;
}

/** Tags that carry no value: `<b>`, `<i>`, … */
const FLAG_TAGS: Record<string, Record<string, string>> = {
  b: { "text-weight": "700" },
  i: { "text-style": "italic" },
  u: { "text-decoration-line": "underline" },
  s: { "text-decoration-line": "line-through" },
  sub: { "vertical-align": "sub", "text-size": "0.75em" },
  sup: { "vertical-align": "super", "text-size": "0.75em" },
  uppercase: { "text-case": "uppercase" },
  allcaps: { "text-case": "uppercase" },
  lowercase: { "text-case": "lowercase" },
  smallcaps: { "font-variant": "small-caps" },
  nobr: { "text-whitespace": "nowrap" },
};

/** Tags that take a value: `<color=red>`, `<size=20>`, … */
const VALUE_TAGS: Record<string, (value: string) => Record<string, string>> = {
  color: (v) => ({ "text-color": v }),
  mark: (v) => ({ "background-color": v }),
  size: (v) => ({ "text-size": v }),
  align: (v) => ({ "text-align": v }),
  alpha: (v) => ({ opacity: alphaToOpacity(v) }),
  "font-weight": (v) => ({ "text-weight": v }),
  "line-height": (v) => ({ "text-leading": v }),
  cspace: (v) => ({ "text-tracking": v }),
  voffset: (v) => ({ "vertical-align": v }),
  indent: (v) => ({ "padding-left": v }),
};

/** `<alpha=#80>` is a hex byte in UITK; CSS wants a 0..1 opacity. */
function alphaToOpacity(value: string): string {
  const hex = value.startsWith("#") ? value.slice(1) : value;
  const n = Number.parseInt(hex, 16);
  if (Number.isNaN(n)) {
    return value;
  }
  return String(Math.max(0, Math.min(1, n / 255)));
}

// `<name>`, `</name>`, `<name=value>`, `<name="value">`. The name pattern also
// admits `-` so `font-weight` / `line-height` match.
const TAG_RE = /^<(\/?)([a-zA-Z][a-zA-Z0-9-]*)(?:=("[^"]*"|[^>]*))?>/;

/**
 * Parse inline rich-text tags into styled runs.
 *
 * Adjacent runs with identical styling are merged, and empty runs dropped, so
 * a plain string yields exactly one unstyled run (and text with no markup
 * costs nothing downstream).
 */
export function parseRichText(input: string): RichTextRun[] {
  const runs: RichTextRun[] = [];
  // Stack of open tags; the active style is the merge of all of them, so a
  // later tag of the same kind wins (matching UITK's "last tag takes
  // precedence").
  const open: { tag: string; style: Record<string, string> }[] = [];
  let buffer = "";

  const activeStyle = (): Record<string, string> | undefined => {
    if (open.length === 0) {
      return undefined;
    }
    const merged: Record<string, string> = {};
    for (const entry of open) {
      Object.assign(merged, entry.style);
    }
    return merged;
  };

  const flush = (): void => {
    if (!buffer) {
      return;
    }
    const style = activeStyle();
    const prev = runs[runs.length - 1];
    if (prev && sameStyle(prev.style, style)) {
      prev.text += buffer;
    } else {
      runs.push(style ? { text: buffer, style } : { text: buffer });
    }
    buffer = "";
  };

  let i = 0;
  while (i < input.length) {
    if (input[i] !== "<") {
      buffer += input[i];
      i += 1;
      continue;
    }

    const rest = input.slice(i);

    // `<noparse>` — everything up to the matching close is literal.
    if (/^<noparse>/i.test(rest)) {
      const end = rest.toLowerCase().indexOf("</noparse>");
      if (end >= 0) {
        buffer += rest.slice("<noparse>".length, end);
        i += end + "</noparse>".length;
        continue;
      }
      // Unterminated: treat the rest as literal.
      buffer += rest.slice("<noparse>".length);
      i = input.length;
      continue;
    }

    const m = TAG_RE.exec(rest);
    if (!m) {
      // Not a tag (`5 < 6`) — literal.
      buffer += "<";
      i += 1;
      continue;
    }

    const [raw, closing, rawName, rawValue] = m;
    const name = rawName!.toLowerCase();

    // `<br>` is a self-closing line break.
    if (!closing && name === "br") {
      buffer += "\n";
      i += raw.length;
      continue;
    }

    const isKnown = name in FLAG_TAGS || name in VALUE_TAGS;
    if (!isKnown) {
      // Unrecognized — emit literally rather than swallowing author text.
      buffer += "<";
      i += 1;
      continue;
    }

    if (closing) {
      // Close the NEAREST matching open tag; ignore a stray close.
      for (let d = open.length - 1; d >= 0; d--) {
        if (open[d]!.tag === name) {
          flush();
          open.splice(d, 1);
          break;
        }
      }
      i += raw.length;
      continue;
    }

    const value = rawValue?.replace(/^"|"$/g, "").trim() ?? "";
    const style =
      name in VALUE_TAGS ? VALUE_TAGS[name]!(value) : FLAG_TAGS[name]!;
    flush();
    open.push({ tag: name, style });
    i += raw.length;
  }

  flush();
  return runs;
}

function sameStyle(
  a: Record<string, string> | undefined,
  b: Record<string, string> | undefined,
): boolean {
  if (!a && !b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  return ak.length === bk.length && ak.every((k) => a[k] === b[k]);
}

/** True when `text` contains anything this parser would act on. */
export function hasRichText(text: string): boolean {
  return text.includes("<");
}

/** True when `runs` is the trivial case — one unstyled run (or nothing), i.e.
 *  content with no inline markup, which renders as a single span. */
export function isPlainRun(runs: RichTextRun[]): boolean {
  return runs.length <= 1 && !runs[0]?.style;
}
