import { randomizer } from "../randomizer";
import { shuffle } from "../shuffle";

export const choose = (
  value: number | [value: number] | [value: number, seed: string],
  _locale?: string,
  ...args: readonly string[]
): [
  string,
  {
    from: number;
    to: number;
    content: string;
    severity?: "info" | "warning" | "error";
    message?: string;
  }[],
  number[]
] => {
  let newArgs = [...args];
  const diagnostics: {
    from: number;
    to: number;
    content: string;
    severity?: "info" | "warning" | "error";
    message?: string;
  }[] = [];
  const v = (Array.isArray(value) ? value[0] : value) || 0;
  const seed = Array.isArray(value) ? value[1] : undefined;
  const firstParamIndex = 0;
  const lastParamIndex = newArgs.length - 1;
  const firstParam = newArgs[firstParamIndex];
  const lastParam = newArgs[lastParamIndex];
  const ignoreArgs = [];
  const shuffled = firstParam?.trim() === "~";
  const randomized = firstParam?.trim() === "~~";
  const repeatLast = lastParam?.trim() === "+";
  if (shuffled || randomized) {
    ignoreArgs.push(firstParamIndex);
    newArgs.shift();
    const cycleIndex = Math.floor(v / newArgs.length);
    // When shuffling, we seed the "random" order so that
    // each option is selected only once per cycle.
    // When randomizing, we don't seed, so that it can be truly random.
    const cycleSeed = shuffled ? (seed || "") + cycleIndex : undefined;
    const rng = seed ? randomizer(cycleSeed) : randomizer();
    if (repeatLast) {
      // Shuffle all except last two
      const cycleMark = newArgs.pop();
      const last = newArgs.pop();
      newArgs = shuffle(newArgs, rng);
      if (last !== undefined) {
        newArgs.push(last);
      }
      if (cycleMark !== undefined) {
        newArgs.push(cycleMark);
      }
    } else {
      // Shuffle all possible
      newArgs = shuffle(newArgs, rng);
    }
  }
  if (repeatLast) {
    ignoreArgs.push(lastParamIndex);
    newArgs.pop();
    const iterationIndex = v % newArgs.length;
    const loopIndex = Math.floor(v / newArgs.length);
    return [
      loopIndex < 1
        ? newArgs[iterationIndex] || ""
        : newArgs[newArgs.length - 1] || "",
      diagnostics,
      ignoreArgs,
    ];
  }
  const iterationIndex = v % newArgs.length;
  return [newArgs[iterationIndex] || "", diagnostics, ignoreArgs];
};
