import {
  SCAN_CLOSE,
  SCAN_OPEN,
  SPAN_CLOSE,
  SPAN_END,
  readSpanOpen,
  tagCode,
} from "./displayStyle";
import { ObjectValue, StringValue } from "./Value";

export const DELIVERY_TAGS: readonly string[] = [
  "speed",
  "pitch",
  "p",
  "wait",
  "w",
  "!",
  "/!",
];

export const LOOK_TAGS: readonly string[] = [
  "b",
  "i",
  "u",
  "s",
  "uppercase",
  "allcaps",
  "lowercase",
  "smallcaps",
  "nobr",
  "color",
  "mark",
  "size",
  "align",
  "alpha",
  "font-weight",
  "line-height",
  "cspace",
  "voffset",
  "indent",
  "sub",
  "sup",
  "br",
];

export const TEXT_COMMAND = String.raw`([<](?!(?:[^\S\n\r])))((?:(?:[\\][^\r\n]|[^>\\\r\n])*?(?<![-])(?=[>])|(?:[\\][^\r\n]|[^>\\\r\n])*?[\\](?![>](?:(?:[\\][^>\r\n]|[^>\\\r\n])*[\\][>]))(?=[>])))([>])`;

const TEXT_COMMAND_AT = new RegExp(TEXT_COMMAND, "y");

const TAG_CONTENT = /^[^\S\n\r]*([^ :\r\n]+)[^\S\n\r]*(?:(:)[^\S\n\r]*(.*))?/;

export interface StoryTag {
  name: string;
  known: boolean;
  closes: boolean;
  argument?: string;
}

const knownName = (name: string): string | undefined =>
  DELIVERY_TAGS.includes(name)
    ? name
    : LOOK_TAGS.includes(name.toLowerCase())
      ? name.toLowerCase()
      : undefined;

export function readStoryTag(content: string): StoryTag {
  const match = TAG_CONTENT.exec(content);
  const written = match?.[1] ?? "";
  const argument = match?.[2] ? { argument: (match[3] ?? "").trim() } : {};
  const name = knownName(written);
  if (name) return { name, known: true, closes: false, ...argument };
  const closed = written.startsWith("/") ? knownName(written.slice(1)) : undefined;
  if (closed) return { name: closed, known: true, closes: true, ...argument };
  return { name: written, known: false, closes: false, ...argument };
}

const SCANNED_BEFORE_TAG_CODES = [...DELIVERY_TAGS, ...LOOK_TAGS, "noparse"];

export function codeWrittenTags(text: string): string {
  if (!text.includes("<")) return text;
  let out = "";
  let scans = 0;
  const spans: string[] = [];
  for (let i = 0; i < text.length; ) {
    const c = text[i]!;
    const opened = readSpanOpen(text, i);
    if (opened) {
      spans.push(opened.mark);
      out += text.slice(i, opened.next);
      i = opened.next;
      continue;
    }
    if (c === SCAN_OPEN || c === SCAN_CLOSE) {
      scans = Math.max(0, scans + (c === SCAN_OPEN ? 1 : -1));
    } else if (c === SPAN_CLOSE || c === SPAN_END) {
      spans.pop();
    }
    const literal = scans > 0 || spans.some((mark) => mark.startsWith("`"));
    if (!literal && c === "\\") {
      out += text.slice(i, i + 2);
      i += 2;
      continue;
    }
    const directive = literal ? "" : c + (text[i + 1] ?? "");
    if (directive === "[[" || directive === "((") {
      const end = text.indexOf(directive === "[[" ? "]]" : "))", i + 2);
      if (end >= 0) {
        out += text.slice(i, end + 2);
        i = end + 2;
        continue;
      }
    }
    if (!literal && c === "<" && !/^\s?$/.test(text[i + 1] ?? "")) {
      const tag = /^<([^>:=\n]*)(?:[:=]([^>\n]*))?>/.exec(text.slice(i));
      const control = tag?.[1]?.trimEnd() ?? "";
      const name = (control.split(/\s/)[0] ?? "").replace(/^\//, "");
      if (
        tag &&
        (SCANNED_BEFORE_TAG_CODES.includes(name) ||
          SCANNED_BEFORE_TAG_CODES.includes(name.toLowerCase()))
      ) {
        const argument = tag[2]?.trim();
        out += tagCode(argument === undefined ? control : `${control}:${argument}`);
        i += tag[0].length;
        continue;
      }
    }
    out += c;
    i++;
  }
  return out;
}

export function codeWrittenTagsInTable<T>(payload: T): T | ObjectValue {
  const text =
    payload instanceof ObjectValue ? payload.value?.get("text") : undefined;
  if (!(text instanceof StringValue) || !text.value) return payload;
  const coded = codeWrittenTags(text.value);
  if (coded === text.value) return payload;
  return new ObjectValue(
    new Map((payload as ObjectValue).value).set("text", new StringValue(coded)),
  );
}

export function readTextCommandAt(
  text: string,
  index: number,
): { content: string; next: number } | undefined {
  TEXT_COMMAND_AT.lastIndex = index;
  const match = TEXT_COMMAND_AT.exec(text);
  if (!match) return undefined;
  return { content: match[2] ?? "", next: index + match[0].length };
}
