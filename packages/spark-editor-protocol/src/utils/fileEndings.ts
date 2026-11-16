export const endings = (typed: string): string[] => [
  ...new Set(
    typed
      .toLowerCase()
      .split(/[\s,;{}]+/)
      .map((ending) => ending.replace(/^[*.]+/, ""))
      .filter((ending) => /^[a-z0-9]+$/.test(ending)),
  ),
];
