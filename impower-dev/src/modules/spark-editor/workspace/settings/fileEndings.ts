export const endings = (typed: string): string[] => [
  ...new Set(
    typed
      .toLowerCase()
      .split(/[\s,;{}]+/)
      .map((ending) => ending.replace(/^[*.]+/, ""))
      .filter((ending) => /^[a-z0-9]+$/.test(ending)),
  ),
];

export const endingsPattern = (list: readonly string[]): string => `*.{${list.join(",")}}`;

export const patternEndings = (pattern: string): string[] => endings(pattern);

export const endingsText = (pattern: string): string => patternEndings(pattern).join(", ");

export const typedPattern = (typed: string, fallbackPattern: string): string => {
  const list = endings(typed);
  return endingsPattern(list.length > 0 ? list : patternEndings(fallbackPattern));
};
