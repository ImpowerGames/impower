export function convertHostToTagSelectors(
  css: string,
  tagName: string,
): string {
  let result = "";
  let i = 0;

  while (i < css.length) {
    if (css.substring(i, i + 5) === ":host") {
      i += 5;

      if (css[i] === "(") {
        let start = i + 1;
        let depth = 1;
        i++;

        while (i < css.length && depth > 0) {
          if (css[i] === "(") depth++;
          if (css[i] === ")") depth--;
          i++;
        }

        const innerSelector = css.substring(start, i - 1);
        result += `${tagName}${innerSelector}`;
      }
      else {
        result += tagName;
      }
    }
    else {
      result += css[i];
      i++;
    }
  }

  return result;
}
