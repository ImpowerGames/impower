export interface LinePosition {
  line: number;
  character: number;
}

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

export function lineCountOf(text: string): number {
  let count = 1;
  for (let i = text.indexOf("\n"); i >= 0; i = text.indexOf("\n", i + 1)) count += 1;
  return count;
}
