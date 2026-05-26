import { ScreenplayToken } from "../types/ScreenplayToken";

const MARKERS = ["^", "*", "_", "~~", "::"];

const stripProductionTags = (raw: string): string => {
  let out = "";
  let i = 0;
  let escaped = false;
  let rawMode = false;
  while (i < raw.length) {
    const char = raw[i] ?? "";
    const nextChar = raw[i + 1] ?? "";
    if (escaped) {
      out += char;
      i += 1;
      escaped = false;
      continue;
    }
    if (char === "`") {
      out += char;
      rawMode = !rawMode;
      i += 1;
      continue;
    }
    if (rawMode) {
      out += char;
      i += 1;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      i += 1;
      continue;
    }
    if (char === "[" && nextChar === "[") {
      const startIndex = i;
      i += 2;
      let closed = false;
      while (i < raw.length) {
        if (raw[i] === "]" && raw[i + 1] === "]") {
          closed = true;
          i += 2;
          while (i < raw.length && (raw[i] === " " || raw[i] === "\t")) i += 1;
          break;
        }
        i += 1;
      }
      if (!closed) {
        out += raw[startIndex] ?? "";
        i = startIndex + 1;
      }
      continue;
    }
    if (char === "(" && nextChar === "(") {
      const startIndex = i;
      i += 2;
      let closed = false;
      while (i < raw.length) {
        if (raw[i] === ")" && raw[i + 1] === ")") {
          closed = true;
          i += 2;
          while (i < raw.length && (raw[i] === " " || raw[i] === "\t")) i += 1;
          break;
        }
        i += 1;
      }
      if (!closed) {
        out += raw[startIndex] ?? "";
        i = startIndex + 1;
      }
      continue;
    }
    if (char === "<") {
      const after = raw[i + 1] ?? "";
      const isWS = after === " " || after === "\t" || after === "\n" || after === "\r" || after === "";
      if (!isWS) {
        const startIndex = i;
        i += 1;
        while (i < raw.length && raw[i] !== ">" && raw[i] !== ":") i += 1;
        if (raw[i] === ":") {
          i += 1;
          while (i < raw.length && raw[i] !== ">") i += 1;
        }
        if (raw[i] === ">") {
          i += 1;
          while (i < raw.length && (raw[i] === " " || raw[i] === "\t")) i += 1;
          continue;
        }
        out += raw[startIndex] ?? "";
        i = startIndex + 1;
        continue;
      }
    }
    const styleMarker = MARKERS.find((m) => raw.slice(i, i + m.length) === m);
    if (styleMarker) {
      while (raw[i] === char) {
        out += raw[i];
        i += 1;
      }
      continue;
    }
    out += char;
    i += 1;
  }
  return out;
};

// Collapse pitch-stacked emphasis runs to base semantic length.
// `_` and `^` have base 1; `*` has base 3 (preserve italic/bold/bold-italic).
// `~~` and `::` are left alone — their pitch semantics on two-char markers
// aren't confirmed here.
const collapseEmphasisRuns = (s: string): string =>
  s.replace(/_{2,}/g, "_").replace(/\*{4,}/g, "***").replace(/\^{2,}/g, "^");

// Trim whitespace immediately inside an emphasis run so the markers remain
// valid delimiters: `** X **` -> `**X**`. Uses a stack-based scanner that
// tracks active marks (mirroring styleText) so it can tell an opening marker
// from a closing one — a regex pass cannot, and would incorrectly eat the
// space after a closing marker (e.g. `5 YEARS AGO:_  A hand` -> `:_A hand`).
const EMPHASIS_MARKERS_LONG_FIRST = ["***", "**", "~~", "::", "*", "_", "^"];
const trimInsideEmphasis = (line: string): string => {
  let out = "";
  let i = 0;
  let escaped = false;
  let rawMode = false;
  const stack: string[] = [];
  while (i < line.length) {
    const c = line[i] ?? "";
    if (escaped) {
      out += c;
      i += 1;
      escaped = false;
      continue;
    }
    if (c === "`") {
      out += c;
      rawMode = !rawMode;
      i += 1;
      continue;
    }
    if (rawMode) {
      out += c;
      i += 1;
      continue;
    }
    if (c === "\\") {
      out += c;
      escaped = true;
      i += 1;
      continue;
    }
    let matched: string | undefined;
    for (const m of EMPHASIS_MARKERS_LONG_FIRST) {
      if (line.slice(i, i + m.length) === m) {
        matched = m;
        break;
      }
    }
    if (matched) {
      const idx = stack.lastIndexOf(matched);
      if (idx !== -1) {
        out = out.replace(/[ \t]+$/, "");
        out += matched;
        stack.length = idx;
      } else {
        out += matched;
        stack.push(matched);
        i += matched.length;
        while (i < line.length && (line[i] === " " || line[i] === "\t")) {
          i += 1;
        }
        continue;
      }
      i += matched.length;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
};

// The parser already strips source-structural indent from token text;
// leading whitespace we see is intentional (display indent from `\    `
// escapes). Middle and trailing whitespace is preserved by design.
const cleanLine = (line: string): string =>
  trimInsideEmphasis(collapseEmphasisRuns(stripProductionTags(line)));

const cleanMultiline = (raw: string): string[] => {
  const lines = raw.split("\n").map(cleanLine);
  while (lines.length > 0 && lines[0] === "") lines.shift();
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
};

const cleanInline = (raw: string): string =>
  cleanLine(raw.replace(/\n+/g, " "));

const formatMeta = (key: string, rawValue: string): string[] => {
  const lines = stripProductionTags(rawValue)
    .split("\n")
    .map((l) => l.replace(/^[ \t]+|[ \t]+$/g, ""));
  while (lines.length > 0 && lines[0] === "") lines.shift();
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  if (lines.length === 0) return [`${key}:`];
  if (lines.length === 1) return [`${key}: ${lines[0]}`];
  return [`${key}:`, ...lines];
};

const positionMarker = (position: "l" | "r" | undefined): string | undefined => {
  if (position === "l") return "[<]";
  if (position === "r") return "[>]";
  return undefined;
};

export const generateScreenplayReadingCopy = (tokens: ScreenplayToken[]): string => {
  const out: string[] = [];
  const metaLines: string[] = [];
  let metaEmitted = false;

  const flushMeta = () => {
    if (metaEmitted || metaLines.length === 0) return;
    out.push("---", ...metaLines, "---", "");
    metaEmitted = true;
  };

  const pushBlank = () => {
    if (out.length > 0 && out[out.length - 1] !== "") out.push("");
  };

  for (const t of tokens) {
    if (typeof t.tag === "string" && t.tag.startsWith("meta:")) {
      const key = t.tag.slice("meta:".length);
      metaLines.push(...formatMeta(key, t.text ?? ""));
      continue;
    }

    flushMeta();

    switch (t.tag) {
      case "separator":
        pushBlank();
        break;
      case "page_break":
      case "function":
      case "scene":
      case "branch":
      case "knot":
      case "stitch":
        break;
      case "title": {
        const lines = cleanMultiline(t.text ?? "");
        if (lines.length === 0) out.push("^:");
        else if (lines.length === 1) out.push(`^: ${lines[0]}`);
        else out.push("^:", ...lines);
        break;
      }
      case "heading": {
        const lines = cleanMultiline(t.text ?? "").filter((l) => l.length > 0);
        out.push(lines.length === 0 ? "$:" : `$: ${lines.join(" ")}`);
        break;
      }
      case "transitional": {
        const lines = cleanMultiline(t.text ?? "").filter((l) => l.length > 0);
        out.push(lines.length === 0 ? "%:" : `%: ${lines.join(" ")}`);
        break;
      }
      case "action": {
        const lines = cleanMultiline(t.text ?? "");
        if (lines.length > 0) out.push(...lines);
        break;
      }
      case "dialogue_character": {
        const name = cleanInline(t.text ?? "");
        const pos = positionMarker(t.position);
        out.push(pos ? `${name} ${pos}:` : `${name}:`);
        break;
      }
      case "dialogue_parenthetical": {
        const text = cleanInline(t.text ?? "");
        if (text.length > 0) out.push(text);
        break;
      }
      case "dialogue_content": {
        const lines = cleanMultiline(t.text ?? "");
        if (lines.length > 0) out.push(...lines);
        break;
      }
      case "choice": {
        const inner = cleanInline(t.text ?? "");
        if (inner.length === 0) break;
        const wrapped =
          inner.startsWith("[") && inner.endsWith("]") ? inner : `[${inner}]`;
        const marker = (t.prefix ?? "").trim() || "+";
        out.push(`${marker} ${wrapped}`);
        break;
      }
      default:
        break;
    }
  }

  if (!metaEmitted && metaLines.length > 0) {
    out.unshift("---", ...metaLines, "---", "");
    metaEmitted = true;
  }

  const collapsed: string[] = [];
  for (const line of out) {
    if (line === "" && collapsed[collapsed.length - 1] === "") continue;
    collapsed.push(line);
  }
  while (collapsed.length > 0 && collapsed[0] === "") collapsed.shift();
  while (collapsed.length > 0 && collapsed[collapsed.length - 1] === "")
    collapsed.pop();

  return collapsed.join("\n") + "\n";
};
