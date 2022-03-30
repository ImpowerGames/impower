import seedrandom from "seedrandom";
import { CompilerDiagnostic } from "../../types/compilerDiagnostic";

const shuffle = <T>(array: T[], seed?: string): T[] => {
  const prng: seedrandom.prng = seed ? seedrandom(seed) : seedrandom();
  const newArray = [...array];
  let currentIndex = newArray.length;
  let temporaryValue;
  let randomIndex;

  // While there remain elements to shuffle...
  while (currentIndex !== 0) {
    // Pick a remaining element...
    const random = prng();
    randomIndex = Math.floor(random * currentIndex);
    currentIndex -= 1;

    // And swap it with the current element.
    temporaryValue = newArray[currentIndex];
    newArray[currentIndex] = newArray[randomIndex];
    newArray[randomIndex] = temporaryValue;
  }

  return newArray;
};

export const choose = (
  value: number | [number] | [number, string],
  locale?: string,
  ...args: string[]
): [string, CompilerDiagnostic[], number[]] => {
  const diagnostics: CompilerDiagnostic[] = [];
  const v = (Array.isArray(value) ? value[0] : value) || 0;
  const seed = Array.isArray(value) ? value[1] : undefined;
  const firstParamIndex = 0;
  const lastParamIndex = args.length - 1;
  const firstParam = args[firstParamIndex];
  const lastParam = args[lastParamIndex];
  const ignoreArgs = [];
  const shuffled = firstParam?.trim() === "~";
  const randomized = firstParam?.trim() === "~*";
  const repeatLast = lastParam?.trim() === ")";
  const repeatCycle = lastParam?.trim() === "(";
  if (shuffled || randomized) {
    ignoreArgs.push(firstParamIndex);
    args.shift();
    const cycleIndex = Math.floor(v / args.length);
    const cycleSeed = randomized ? undefined : seed + cycleIndex;
    // We seed the "random" order so that
    // each is selected only once per loop
    if (repeatLast) {
      // Shuffle all except last two
      const cycleMark = args.pop();
      const last = args.pop();
      args = shuffle(args, cycleSeed);
      if (last !== undefined) {
        args.push(last);
      }
      if (cycleMark !== undefined) {
        args.push(cycleMark);
      }
    } else if (repeatCycle) {
      // Shuffle all except last
      const cycleMark = args.pop();
      args = shuffle(args, cycleSeed);
      if (cycleMark !== undefined) {
        args.push(cycleMark);
      }
    } else {
      // Shuffle all possible
      args = shuffle(args, cycleSeed);
    }
  }
  if (repeatLast) {
    ignoreArgs.push(lastParamIndex);
    args.pop();
    const iterationIndex = v % args.length;
    const loopIndex = Math.floor(v / args.length);
    return [
      loopIndex < 1 ? args[iterationIndex] : args[args.length - 1],
      diagnostics,
      ignoreArgs,
    ];
  }
  if (repeatCycle) {
    ignoreArgs.push(lastParamIndex);
    args.pop();
    const iterationIndex = v % args.length;
    return [args[iterationIndex], diagnostics, ignoreArgs];
  }
  const iterationIndex = v % args.length;
  const loopIndex = Math.floor(v / args.length);
  return [loopIndex < 1 ? args[iterationIndex] : "", diagnostics, ignoreArgs];
};
