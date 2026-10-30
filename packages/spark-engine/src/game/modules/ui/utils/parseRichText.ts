export interface RichTextRun {
  text: string;
  style?: Record<string, string>;
  tag?: string;
}

const ELEMENT_RUN_TAGS: Record<string, string> = {
  sub: "sub",
  sup: "sup",
};

const FLAG_TAGS: Record<string, Record<string, string>> = {
  b: { "text-weight": "700" },
  i: { "text-style": "italic" },
  u: { "text-decoration-line": "underline" },
  s: { "text-decoration-line": "line-through" },
  uppercase: { "text-case": "uppercase" },
  allcaps: { "text-case": "uppercase" },
  lowercase: { "text-case": "lowercase" },
  smallcaps: { "font-variant": "small-caps" },
  nobr: { "text-whitespace": "nowrap" },
};

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

function alphaToOpacity(value: string): string {
  const hex = value.startsWith("#") ? value.slice(1) : value;
  const n = Number.parseInt(hex, 16);
  if (Number.isNaN(n)) {
    return value;
  }
  return String(Math.max(0, Math.min(1, n / 255)));
}

const TAG_RE = /^<(\/?)([a-zA-Z][a-zA-Z0-9-]*)(?:=("[^"]*"|[^>]*))?>/;

export function parseRichText(input: string): RichTextRun[] {
  const runs: RichTextRun[] = [];
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

  const activeTag = (): string | undefined => {
    for (let d = open.length - 1; d >= 0; d--) {
      const mapped = ELEMENT_RUN_TAGS[open[d]!.tag];
      if (mapped) {
        return mapped;
      }
    }
    return undefined;
  };

  const flush = (): void => {
    if (!buffer) {
      return;
    }
    const style = activeStyle();
    const tag = activeTag();
    const prev = runs[runs.length - 1];
    if (prev && prev.tag === tag && sameStyle(prev.style, style)) {
      prev.text += buffer;
    } else {
      const run: RichTextRun = { text: buffer };
      if (style) {
        run.style = style;
      }
      if (tag) {
        run.tag = tag;
      }
      runs.push(run);
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

    if (/^<noparse>/i.test(rest)) {
      const end = rest.toLowerCase().indexOf("</noparse>");
      if (end >= 0) {
        buffer += rest.slice("<noparse>".length, end);
        i += end + "</noparse>".length;
        continue;
      }
      buffer += rest.slice("<noparse>".length);
      i = input.length;
      continue;
    }

    const m = TAG_RE.exec(rest);
    if (!m) {
      buffer += "<";
      i += 1;
      continue;
    }

    const [raw, closing, rawName, rawValue] = m;
    const name = rawName!.toLowerCase();

    if (!closing && name === "br") {
      buffer += "\n";
      i += raw.length;
      continue;
    }

    const isKnown =
      name in FLAG_TAGS || name in VALUE_TAGS || name in ELEMENT_RUN_TAGS;
    if (!isKnown) {
      buffer += "<";
      i += 1;
      continue;
    }

    if (closing) {
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

    const value = rawValue?.trim().replace(/^"|"$/g, "") ?? "";
    const style =
      name in VALUE_TAGS ? VALUE_TAGS[name]!(value) : (FLAG_TAGS[name] ?? {});
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

export function hasRichText(text: string): boolean {
  return text.includes("<");
}

export function isPlainRun(runs: RichTextRun[]): boolean {
  return runs.length <= 1 && !runs[0]?.style;
}
