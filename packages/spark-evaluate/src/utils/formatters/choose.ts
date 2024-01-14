import randomizer from "../randomizer";
import shuffle from "../shuffle";

const choose = (
  value: number | [$visited: number, $key?: string, $seed?: string],
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
  // The number of times we've made this choice.
  const visited = (Array.isArray(value) ? value[0] : value) || 0;
  // A unique identifier for this choice.
  const key = String((Array.isArray(value) ? value[1] : undefined) || "");
  // The seed for this playthrough.
  const seed = String((Array.isArray(value) ? value[2] : undefined) || "");
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
    // The number of times we've cycled through all the options.
    const cycled = Math.floor(visited / newArgs.length);
    const rng = shuffled
      ? // When shuffling, we seed with cycle count so that
        // the option order only changes when the cycle count changes (once we've cycled through all the options)
        randomizer(seed + key + cycled)
      : // When randomizing, we seed with visited count so that
        // the option order changes every time we revisit this choice.
        randomizer(seed + key + visited);
    if (repeatLast) {
      // Shuffle all except last option and repeat mark
      const repeatMark = newArgs.pop();
      const lastOption = newArgs.pop();
      newArgs = shuffle(newArgs, rng);
      if (lastOption !== undefined) {
        newArgs.push(lastOption);
      }
      if (repeatMark !== undefined) {
        newArgs.push(repeatMark);
      }
    } else {
      // Shuffle all options
      newArgs = shuffle(newArgs, rng);
    }
  }
  if (repeatLast) {
    ignoreArgs.push(lastParamIndex);
    newArgs.pop();
    const iterationIndex = visited % newArgs.length;
    const loopIndex = Math.floor(visited / newArgs.length);
    return [
      loopIndex < 1
        ? newArgs[iterationIndex] || ""
        : newArgs[newArgs.length - 1] || "",
      diagnostics,
      ignoreArgs,
    ];
  }
  const iterationIndex = visited % newArgs.length;
  return [newArgs[iterationIndex] || "", diagnostics, ignoreArgs];
};

export default choose;
