/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** A capturing group inside a lookaround, whose text is not the match's. */
export const LOOKAROUND_GROUP = -1;

/**
 * Reads where each capturing group of a `RegExp` source sits. Entry `i` (for
 * group `i`, from 1) is the nearest capturing group that encloses it, `0` when
 * none does, or {@link LOOKAROUND_GROUP} when a lookaround encloses it. Named
 * groups count in source order, as `RegExp` and Oniguruma number them. Entry
 * 0 is always 0.
 */
export const analyzeCaptureGroups = (source: string): number[] => {
  const parents: number[] = [0];
  // One frame per open group: the capturing group it is (0 if it is not
  // one), and the parent its own capturing groups take.
  const stack: { parent: number }[] = [];
  let inClass = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === "\\") {
      i++;
      continue;
    }
    if (inClass) {
      if (c === "]") {
        inClass = false;
      }
      continue;
    }
    if (c === "[") {
      inClass = true;
      continue;
    }
    if (c === ")") {
      stack.pop();
      continue;
    }
    if (c !== "(") {
      continue;
    }
    const enclosing = stack.at(-1)?.parent ?? 0;
    if (source[i + 1] !== "?") {
      parents.push(enclosing);
      stack.push({
        parent: enclosing === LOOKAROUND_GROUP ? enclosing : parents.length - 1,
      });
      continue;
    }
    const kind = source.slice(i + 2, i + 4);
    if (kind[0] === "=" || kind[0] === "!" || kind === "<=" || kind === "<!") {
      stack.push({ parent: LOOKAROUND_GROUP });
    } else if (kind[0] === "<") {
      // A named group, `(?<name>...)`.
      parents.push(enclosing);
      stack.push({
        parent: enclosing === LOOKAROUND_GROUP ? enclosing : parents.length - 1,
      });
    } else {
      stack.push({ parent: enclosing });
    }
  }
  return parents;
};
