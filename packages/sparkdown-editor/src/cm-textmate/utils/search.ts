export interface SearchOpts {
  /** Starting minimum index for the search. */
  min?: number;
  /** Starting maximum index for the search. */
  max?: number;
  /**
   * If true, the search will return the closest index to the desired value
   * on failure.
   */
  precise?: boolean;
}

/**
 * Performs a binary search through an array.
 *
 * The comparator function should return -1 if undershooting the desired
 * value, +1 if overshooting, and 0 if the value was found.
 *
 * The comparator can also short-circuit the search by returning true or
 * false. Returning true is like returning a 0 (target found), but
 * returning false induces a null return.
 */
export function search<T, TR>(
  haystack: T[],
  target: TR,
  comparator: (element: T, target: TR) => number | boolean,
  { min = 0, max = haystack.length - 1, precise = true }: SearchOpts = {}
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
