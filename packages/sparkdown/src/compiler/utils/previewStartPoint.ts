import type { LineBeat, ProgramAddress } from "../types/ProgramAddress";
import type { SparkProgram } from "../types/SparkProgram";
import { programLocator } from "./programLocator";

export interface StartPoint {
  file: string;
  line: number;
  address?: ProgramAddress;
}

export interface StartedPoint {
  point: StartPoint;
  beat: "first" | "last";
}

export const spansHold = (
  spans: { [uri: string]: [number, number][] } | undefined,
  point: StartPoint,
) =>
  (spans?.[point.file] ?? []).some(
    ([first, last]) => first <= point.line && point.line <= last,
  );

export const startPointInScene = (
  program: SparkProgram,
  point: StartPoint,
  beat: "first" | "last",
): StartedPoint => {
  const locator = programLocator(program);
  const ends = program.flowEnds?.[point.file] ?? [];
  const closed = ends.find(([, end]) => end === point.line);
  if (!closed && locator.addressAt(point.file, point.line, { beat }) != null) {
    return { point, beat };
  }
  const lineAbove = (
    from: number,
    floor: number,
    skipped: readonly (readonly [number, number])[],
  ): StartedPoint | undefined => {
    for (let line = from; line > floor; line -= 1) {
      if (skipped.some(([header, end]) => header <= line && line <= end)) {
        continue;
      }
      const closedAbove = ends.find(
        ([header, end]) =>
          end === line &&
          !ends.some(([h, e]) => h < header && end < e),
      );
      if (closedAbove) {
        return startPointInScene(program, { file: point.file, line }, "last");
      }
      const address = locator.addressAt(point.file, line, { beat: "last" });
      const location = locator.locationOf(address);
      if (location && location.startLine <= line) {
        return { point: { file: point.file, line }, beat: "last" };
      }
    }
    return undefined;
  };
  if (closed) {
    const [header] = closed;
    const address = program.chunks?.flowEndAddress(point.file, header);
    if (address !== undefined) {
      return { point: { ...point, address }, beat: "last" };
    }
    const nested = ends.filter(([h, e]) => h > header && e < point.line);
    const own = lineAbove(point.line - 1, header, nested);
    if (own) {
      return own;
    }
    const first = nested.reduce<(typeof nested)[number] | undefined>(
      (earliest, flow) => (!earliest || flow[0] < earliest[0] ? flow : earliest),
      undefined,
    );
    if (first && program.chunks?.bindsParameters(point.file, first[0]) === false) {
      return startPointInScene(program, { file: point.file, line: first[1] }, beat);
    }
  }
  return lineAbove(point.line - 1, -1, []) ?? { point, beat };
};

export const startPoint = (
  program: SparkProgram,
  point: StartPoint,
  beat: "first" | "last",
): StartedPoint | undefined =>
  spansHold(program.sceneSpans, point)
    ? startPointInScene(program, point, beat)
    : undefined;

export const previewBeatAt = (
  program: SparkProgram,
  uri: string,
  line: number,
): LineBeat | undefined => {
  const shown = startPoint(program, { file: uri, line }, "last");
  if (!shown) {
    return undefined;
  }
  const locator = programLocator(program);
  const address =
    shown.point.address ??
    locator.addressAt(shown.point.file, shown.point.line, { beat: "last" });
  if (address == null) {
    return undefined;
  }
  const shownAddress = program.chunks?.shownBeatAddress(address) ?? address;
  const location = locator.locationOf(shownAddress);
  return location ? { address, location } : { address };
};
