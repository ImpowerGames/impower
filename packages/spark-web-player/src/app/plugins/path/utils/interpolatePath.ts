import { PathCommand, PathData } from "../types/Path";

const interpolate = (
  t: number,
  a: number,
  b: number,
  ease: (t: number) => number = (t: number): number => t
): number => {
  if (t <= 0) {
    return a;
  }
  const p = t - Math.floor(t);
  if (!ease) {
    return b;
  }
  return a * (1 - ease(p)) + b * ease(p);
};

export const interpolatePath = (
  t: number,
  aCommands: PathCommand[],
  bCommands: PathCommand[],
  ease: (t: number) => number = (t: number): number => t
): PathCommand[] => {
  const commands: PathCommand[] = [];
  const commandCount = Math.max(aCommands.length, bCommands.length);
  for (let i = 0; i < commandCount; i += 1) {
    const aCommand = aCommands[i];
    const bCommand = bCommands[i];
    const data = [] as number[] as PathData;
    const dataCount = Math.max(
      aCommand?.data?.length ?? 0,
      bCommand?.data?.length ?? 0
    );
    for (let d = 0; d < dataCount; d += 1) {
      const a = aCommand?.data?.[d] ?? bCommand?.data?.[d] ?? 0;
      const b = bCommand?.data?.[d] ?? aCommand?.data?.[d] ?? 0;
      data[d] = interpolate(t, a, b, ease);
    }
    const command = {
      command: aCommand?.command ?? bCommand?.command ?? "M",
      data,
    };
    commands.push(command);
  }
  return commands;
};
