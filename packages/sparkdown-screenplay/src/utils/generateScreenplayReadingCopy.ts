import { writtenText } from "../../../sparkdown/src/runtime/displayStyle";
import { ScreenplayToken } from "../types/ScreenplayToken";

const INDENT = "  ";

const cleanLine = (line: string): string => writtenText(line);

const cleanMultiline = (raw: string): string[] => {
  const lines = raw.split("\n").map(cleanLine);
  while (lines.length > 0 && lines[0] === "") lines.shift();
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
};

const cleanInline = (raw: string): string =>
  cleanLine(raw.replace(/\n+/g, " "));

const formatMeta = (key: string, rawValue: string): string[] => {
  const lines = writtenText(rawValue)
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
      metaLines.push(...formatMeta(key, t.styled ?? t.text ?? ""));
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
        const lines = cleanMultiline(t.styled ?? t.text ?? "");
        if (lines.length === 0) out.push("^:");
        else if (lines.length === 1) out.push(`^: ${lines[0]}`);
        else out.push("^:", ...lines.map((l) => `${INDENT}${l}`));
        break;
      }
      case "heading": {
        const lines = cleanMultiline(t.styled ?? t.text ?? "").filter((l) => l.length > 0);
        out.push(lines.length === 0 ? "$:" : `$: ${lines.join(" ")}`);
        break;
      }
      case "transitional": {
        const lines = cleanMultiline(t.styled ?? t.text ?? "").filter((l) => l.length > 0);
        out.push(lines.length === 0 ? "%:" : `%: ${lines.join(" ")}`);
        break;
      }
      case "action": {
        const lines = cleanMultiline(t.styled ?? t.text ?? "");
        if (lines.length > 0) out.push(...lines);
        break;
      }
      case "dialogue_character": {
        const name = cleanInline(t.styled ?? t.text ?? "");
        const pos = positionMarker(t.position);
        out.push(pos ? `${name} ${pos}:` : `${name}:`);
        break;
      }
      case "dialogue_parenthetical": {
        const text = cleanInline(t.styled ?? t.text ?? "");
        if (text.length > 0) out.push(`${INDENT}${text}`);
        break;
      }
      case "dialogue_content": {
        const lines = cleanMultiline(t.styled ?? t.text ?? "");
        if (lines.length > 0) out.push(...lines.map((l) => `${INDENT}${l}`));
        break;
      }
      case "choice": {
        const inner = cleanInline(t.styled ?? t.text ?? "");
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
