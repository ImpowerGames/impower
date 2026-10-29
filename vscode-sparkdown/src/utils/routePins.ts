import type { RoutePin } from "@impower/spark-editor-protocol/src/protocols/preview/SetRoutePinsMessage";
import type { RoutePinsByScript } from "@impower/spark-editor-protocol/src/utils/changedRoutePins";

export interface ScriptRoutePin {
  line: number;
  offer: number;
}

export const allRoutePins = (byScript: RoutePinsByScript): RoutePin[] =>
  Object.entries(byScript).flatMap(([uri, pins]) =>
    pins.map(({ line, offer }) => ({ uri, line, offer })),
  );

export interface RoutePinMark {
  lineStart: number;
  lineEnd: number;
  offer: number;
}

export interface TextReplacement {
  rangeOffset: number;
  rangeLength: number;
  text: string;
}

export interface DocumentLines {
  lineCount: number;
  lineSpan(line: number): { lineStart: number; lineEnd: number };
  lineAt(offset: number): number;
}

export const routePinMarks = (
  document: DocumentLines,
  pins: readonly ScriptRoutePin[],
): RoutePinMark[] =>
  pins
    .filter(
      (pin) =>
        Number.isInteger(pin.line) &&
        pin.line >= 0 &&
        pin.line < document.lineCount,
    )
    .map((pin) => ({ ...document.lineSpan(pin.line), offer: pin.offer }));

const mapOffset = (
  offset: number,
  assoc: "before" | "after",
  replacement: TextReplacement,
) => {
  const replacedStart = replacement.rangeOffset;
  const replacedEnd = replacedStart + replacement.rangeLength;
  const insertedLength = replacement.text.length;
  const isInsertion = replacement.rangeLength === 0;
  if (offset < replacedStart) {
    return offset;
  }
  if (
    offset < replacedEnd ||
    (offset === replacedEnd && assoc === "before" && isInsertion)
  ) {
    return offset === replacedStart || assoc === "before"
      ? replacedStart
      : replacedStart + insertedLength;
  }
  return offset + insertedLength - replacement.rangeLength;
};

export const mapRoutePinMarks = (
  marks: readonly RoutePinMark[],
  replacements: readonly TextReplacement[],
  editedDocument: DocumentLines,
): RoutePinMark[] => {
  const mapped: RoutePinMark[] = [];
  for (const mark of marks) {
    const lineStart = replacements.reduce(
      (offset, replacement) => mapOffset(offset, "after", replacement),
      mark.lineStart,
    );
    const lineEnd = replacements.reduce(
      (offset, replacement) => mapOffset(offset, "before", replacement),
      mark.lineEnd,
    );
    const lineTextDeleted =
      mark.lineEnd > mark.lineStart && lineEnd <= lineStart;
    if (lineTextDeleted) {
      continue;
    }
    const span = editedDocument.lineSpan(editedDocument.lineAt(lineStart));
    if (
      !mapped.some(
        (m) => m.lineStart === span.lineStart && m.offer === mark.offer,
      )
    ) {
      mapped.push({ ...span, offer: mark.offer });
    }
  }
  return mapped;
};

export const routePinsOfMarks = (
  marks: readonly RoutePinMark[],
  document: DocumentLines,
): ScriptRoutePin[] =>
  [...marks]
    .sort((a, b) => a.lineStart - b.lineStart || a.offer - b.offer)
    .map((mark) => ({
      line: document.lineAt(mark.lineStart),
      offer: mark.offer,
    }));
