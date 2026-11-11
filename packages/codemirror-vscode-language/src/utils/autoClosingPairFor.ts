export interface AutoClosingPair {
  open: string;
  close: string;
  notIn?: string[];
}

const longest = <T extends AutoClosingPair>(pairs: readonly T[]) =>
  pairs.reduce<T | undefined>(
    (result, pair) =>
      !result || pair.open.length > result.open.length ? pair : result,
    undefined,
  );

export const autoClosingPairFor = <T extends AutoClosingPair>(
  pairs: readonly T[],
  insert: string,
  lineBefore: string,
  lineAfter: string,
): { pair: T; close: string } | null => {
  const pair = longest(
    pairs.filter(({ open, close }) => {
      if (open == null || close == null) return false;
      if (!open.endsWith(insert)) return false;
      return lineBefore.endsWith(open.slice(0, open.length - insert.length));
    }),
  );
  if (!pair) {
    return null;
  }
  const containedPair = longest(
    pairs.filter(
      ({ open, close }) =>
        open !== pair.open &&
        pair.open.includes(open) &&
        pair.close.endsWith(close),
    ),
  );
  return {
    pair,
    close:
      containedPair && lineAfter.startsWith(containedPair.close)
        ? pair.close.slice(0, pair.close.length - containedPair.close.length)
        : pair.close,
  };
};
