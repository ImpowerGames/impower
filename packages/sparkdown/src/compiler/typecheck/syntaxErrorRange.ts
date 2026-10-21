/** A document position in lines and UTF-16 characters, both 0-based. */
export interface LinePosition {
  line: number;
  character: number;
}

/**
 * Where a syntax error of a reading of Luau ends in the document, as
 * Sparkdown ranges one, from Luau's range (`start`-`end`) and its message;
 * the type checker and the lowerers that read Luau share it (I-1368).
 *
 * A missing type's range from where the type should stand to the token
 * found on a later line (`local w:` before a line `local z = 1`) ends with
 * the line the type is missing from, not at the token Luau's parser
 * recovers with. A range that ends at the end of the Luau read, whose
 * trailing line break is not in its text, or that is empty, ends at the
 * start of the next line, where Luau's end-of-file range ends when the
 * source ends with a line break. Other errors keep their range.
 * `lineCount` is the number of lines in the document.
 */
export function syntaxErrorEnd(
  start: LinePosition,
  end: LinePosition,
  message: string,
  lineCount: () => number,
): LinePosition {
  const atEnd = message.endsWith("got <eof>");
  const missingType = message.startsWith("Expected type");
  if (missingType && (end.line > start.line + 1 || (end.line === start.line + 1 && end.character > 0))) {
    return start.line + 1 < lineCount() ? { line: start.line + 1, character: 0 } : end;
  }
  const after = end.line > start.line || (end.line === start.line && end.character > start.character);
  if (after && (!atEnd || end.character === 0)) return end;
  const line = after ? end.line : start.line;
  return line + 1 < lineCount() ? { line: line + 1, character: 0 } : after ? end : start;
}

/** The number of lines in a text. */
export function lineCountOf(text: string): number {
  let count = 1;
  for (let i = text.indexOf("\n"); i >= 0; i = text.indexOf("\n", i + 1)) count += 1;
  return count;
}
