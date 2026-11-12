export const SCANNED_MARKS: readonly string[] = ["^", "*", "_", "~~", "::"];

export const SCAN_OPEN = String.fromCharCode(0xe000);
export const SCAN_CLOSE = String.fromCharCode(0xe001);
export const SPAN_CLOSE = String.fromCharCode(0xe002);
export const SPAN_END = String.fromCharCode(0xe003);

const SPAN_MARK_CHARACTERS = ["*", "_", "^", "~", ":", "`"];
const SPAN_OPEN_BASE = 0xe100;
const SPAN_OPEN_LENGTHS = 0x20;
const SPAN_OPEN_LIMIT =
  SPAN_OPEN_BASE + SPAN_MARK_CHARACTERS.length * SPAN_OPEN_LENGTHS;

const STYLE_CODE = /[--]/;
const STYLE_CODES = /[--]/g;

export function spanOpen(mark: string): string {
  const kind = SPAN_MARK_CHARACTERS.indexOf(mark[0] ?? "");
  if (kind < 0 || mark.length === 0) {
    throw new Error(`Not a span mark: ${JSON.stringify(mark)}`);
  }
  const length = Math.min(mark.length, SPAN_OPEN_LENGTHS - 1);
  return String.fromCharCode(
    SPAN_OPEN_BASE + kind * SPAN_OPEN_LENGTHS + length,
  );
}

export function spanOpenMark(code: string): string | undefined {
  const point = code.charCodeAt(0);
  if (code.length !== 1 || point < SPAN_OPEN_BASE || point >= SPAN_OPEN_LIMIT) {
    return undefined;
  }
  const offset = point - SPAN_OPEN_BASE;
  const kind = SPAN_MARK_CHARACTERS[Math.floor(offset / SPAN_OPEN_LENGTHS)]!;
  return kind.repeat(offset % SPAN_OPEN_LENGTHS);
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
  for (const c of text) {
    if (c === SCAN_OPEN || c === SCAN_CLOSE) continue;
    if (c === SPAN_CLOSE) {
      out += open.pop() ?? "";
    } else if (c === SPAN_END) {
      open.pop();
    } else {
      const mark = spanOpenMark(c);
      if (mark) {
        open.push(mark);
        out += mark;
      } else {
        out += c;
      }
    }
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
