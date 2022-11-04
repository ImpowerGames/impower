export const versionGenerator = (
  current?: string
): ((level?: number) => string) => {
  current = current || "0";

  const numbers: number[] = current
    .split(".")
    .map((x) => Number(x))
    .concat([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

  const bump = (level: number): void => {
    numbers[level - 1]++;
    for (let i = level; i < numbers.length; i++) {
      numbers[i] = 0;
    }
  };

  const toStr = (): string => {
    const copy = numbers.concat();
    copy.reverse();
    while (copy.length > 1 && copy[0] === 0) {
      copy.shift();
    }
    copy.reverse();
    return copy.join(".");
  };

  const increase = (level?: number): string => {
    if (level === undefined) {
      return toStr();
    }
    bump(level);
    return toStr();
  };

  return increase;
};
