import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { OUTSIDE_EVERY_SCENE_REFUSAL } from "../workers/messages/PlayMessage";

export interface LinePoint {
  file: string;
  line: number;
}

export const spansHold = (
  spans: { [uri: string]: [number, number][] } | undefined,
  point: LinePoint,
): boolean =>
  (spans?.[point.file] ?? []).some(
    ([first, last]) => first <= point.line && point.line <= last,
  );

export const startRefusalAt = (
  program: SparkProgram,
  point: LinePoint,
): string | null =>
  spansHold(program.sceneSpans, point) ? null : OUTSIDE_EVERY_SCENE_REFUSAL;
