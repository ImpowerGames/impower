export function search<T, TR>(
  haystack: T[],
  target: TR,
  comparator: (element: T, target: TR) => number | boolean,
  {
    min = 0,
    max = haystack.length - 1,
    precise = true,
  }: {
    min?: number;
    max?: number;
    precise?: boolean;
  } = {},
) {
  if (haystack.length === 0) {
    return null;
  }

  let index = -1;
  while (min <= max) {
    index = min + ((max - min) >>> 1);
    const cmp = comparator(haystack[index]!, target);
    if (cmp === true || cmp === 0) {
      return { element: haystack[index], index };
    }
    if (cmp === false) {
      return null;
    }
    if (cmp < 0) {
      min = index + 1;
    } else if (cmp > 0) {
      max = index - 1;
    }
  }

  if (index === -1) {
    return null;
  }

  if (!precise) {
    return { element: null, index };
  }

  return null;
}
