/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export const LOOKAROUND_GROUP = -1;

export const analyzeCaptureGroups = (source: string): number[] => {
  const parents: number[] = [0];
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
