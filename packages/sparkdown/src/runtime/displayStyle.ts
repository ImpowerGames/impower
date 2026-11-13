import { ObjectValue, StringValue } from "./Value";

export const SCANNED_MARKS: readonly string[] = ["^", "*", "_", "~~", "::"];

const SCAN_OPEN_POINT = 0xe000;
const SCAN_CLOSE_POINT = 0xe001;
const SPAN_CLOSE_POINT = 0xe002;
const SPAN_END_POINT = 0xe003;
const SPAN_KIND_BASE = 0xe010;
const LENGTH_DIGIT_BASE = 0xe020;
const LENGTH_DIGITS = 32;

export const SCAN_OPEN = String.fromCharCode(SCAN_OPEN_POINT);
export const SCAN_CLOSE = String.fromCharCode(SCAN_CLOSE_POINT);
export const SPAN_CLOSE = String.fromCharCode(SPAN_CLOSE_POINT);
export const SPAN_END = String.fromCharCode(SPAN_END_POINT);

const SPAN_MARK_CHARACTERS = ["*", "_", "^", "~", ":", "`"];

const range = (from: number, count: number) =>
  `${String.fromCharCode(from)}-${String.fromCharCode(from + count - 1)}`;
const STYLE_CODE_CLASS = `[${range(SCAN_OPEN_POINT, 4)}${range(SPAN_KIND_BASE, SPAN_MARK_CHARACTERS.length)}${range(LENGTH_DIGIT_BASE, LENGTH_DIGITS)}]`;
const STYLE_CODE = new RegExp(STYLE_CODE_CLASS);
const STYLE_CODES = new RegExp(STYLE_CODE_CLASS, "g");

export function spanOpen(mark: string): string {
  const kind = SPAN_MARK_CHARACTERS.indexOf(mark[0] ?? "");
  if (kind < 0) {
    throw new Error(`Not a span mark: ${JSON.stringify(mark)}`);
  }
  let digits = "";
  for (let length = mark.length; digits === "" || length > 0; ) {
    digits =
      String.fromCharCode(LENGTH_DIGIT_BASE + (length % LENGTH_DIGITS)) +
      digits;
    length = Math.floor(length / LENGTH_DIGITS);
  }
  return String.fromCharCode(SPAN_KIND_BASE + kind) + digits;
}

const lengthDigit = (character: string | undefined): number => {
  const point = character?.charCodeAt(0) ?? -1;
  return point >= LENGTH_DIGIT_BASE && point < LENGTH_DIGIT_BASE + LENGTH_DIGITS
    ? point - LENGTH_DIGIT_BASE
    : -1;
};

export function readSpanOpen(
  characters: ArrayLike<string>,
  index: number,
): { mark: string; next: number } | undefined {
  const kind =
    (characters[index]?.charCodeAt(0) ?? -1) - SPAN_KIND_BASE;
  const character = SPAN_MARK_CHARACTERS[kind];
  if (kind < 0 || !character) return undefined;
  let next = index + 1;
  let length = 0;
  for (let digit = lengthDigit(characters[next]); digit >= 0; ) {
    length = length * LENGTH_DIGITS + digit;
    next++;
    digit = lengthDigit(characters[next]);
  }
  return { mark: character.repeat(length), next };
}

export function isStyleCode(character: string): boolean {
  return character.length === 1 && STYLE_CODE.test(character);
}

export function hasStyleCodes(text: string): boolean {
  return STYLE_CODE.test(text);
}

export function stripStyleCodes(text: string): string {
  return STYLE_CODE.test(text) ? text.replace(STYLE_CODES, "") : text;
}

export function writtenText(text: string): string {
  if (!STYLE_CODE.test(text)) return text;
  let out = "";
  const open: string[] = [];
  for (let i = 0; i < text.length; ) {
    const c = text[i]!;
    const opened = readSpanOpen(text, i);
    if (opened) {
      open.push(opened.mark);
      out += opened.mark;
      i = opened.next;
      continue;
    }
    if (c === SPAN_CLOSE) {
      out += open.pop() ?? "";
    } else if (c === SPAN_END) {
      open.pop();
    } else if (!isStyleCode(c)) {
      out += c;
    }
    i++;
  }
  return out;
}

export function trimStyled(
  text: string,
  { start = true, end = true }: { start?: boolean; end?: boolean } = {},
): string {
  if (!STYLE_CODE.test(text)) {
    return start && end ? text.trim() : start ? text.trimStart() : text.trimEnd();
  }
  const chars = [...text];
  const visible = (c: string) =>
    c !== SCAN_OPEN && c !== SCAN_CLOSE && c !== SPAN_END && !/\s/.test(c);
  let from = 0;
  let to = chars.length;
  if (start) {
    while (from < to && !visible(chars[from]!)) from++;
  }
  if (end) {
    while (to > from && !visible(chars[to - 1]!)) to--;
  }
  const codes = (part: string[]) => part.filter(isStyleCode).join("");
  return (
    codes(chars.slice(0, from)) +
    chars.slice(from, to).join("") +
    codes(chars.slice(to))
  );
}

export function scanned(text: string): string {
  return SCAN_OPEN + stripStyleCodes(text) + SCAN_CLOSE;
}

export function scannedTable<T>(payload: T): T | ObjectValue {
  const text =
    payload instanceof ObjectValue ? payload.value?.get("text") : undefined;
  if (!(text instanceof StringValue) || !text.value) return payload;
  return new ObjectValue(
    new Map((payload as ObjectValue).value).set(
      "text",
      new StringValue(scanned(text.value)),
    ),
  );
}
