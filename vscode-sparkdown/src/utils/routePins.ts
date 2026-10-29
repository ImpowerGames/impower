import type { ChangeRoutePinsParams } from "@impower/spark-editor-protocol/src/protocols/preview/ChangeRoutePinsMessage";
import type { RoutePin } from "@impower/spark-editor-protocol/src/protocols/preview/SetRoutePinsMessage";

export interface ScriptRoutePin {
  line: number;
  offer: number;
}

export type RoutePinsByScript = Record<string, ScriptRoutePin[]>;

export const allRoutePins = (byScript: RoutePinsByScript): RoutePin[] =>
  Object.entries(byScript).flatMap(([uri, pins]) =>
    pins.map(({ line, offer }) => ({ uri, line, offer })),
  );

const samePin = (a: ScriptRoutePin, uri: string, b: RoutePin) =>
  uri === b.uri && a.line === b.line && a.offer === b.offer;

export const changedRoutePins = (
  byScript: RoutePinsByScript,
  change: ChangeRoutePinsParams,
): RoutePinsByScript => {
  const changed: RoutePinsByScript = {};
  if (!change.removeAll) {
    for (const [uri, pins] of Object.entries(byScript)) {
      changed[uri] = pins.filter(
        (pin) => !(change.remove ?? []).some((gone) => samePin(pin, uri, gone)),
      );
    }
  }
  for (const pin of change.add ?? []) {
    const pins = (changed[pin.uri] ??= []);
    if (!pins.some((at) => samePin(at, pin.uri, pin))) {
      pins.push({ line: pin.line, offer: pin.offer });
    }
  }
  for (const [uri, pins] of Object.entries(changed)) {
    if (pins.length === 0) {
      delete changed[uri];
    }
  }
  return changed;
};

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
