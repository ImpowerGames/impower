export default function convertHostToTagSelectors(
  css: string,
  tagName: string,
): string {
  let result = "";
  let i = 0;

  while (i < css.length) {
    // Check if we found a :host sequence
    if (css.substring(i, i + 5) === ":host") {
      i += 5;

      // Case 1: :host followed by '(' - handle nested content
      if (css[i] === "(") {
        let start = i + 1;
        let depth = 1;
        i++;

        // Scan forward to find the matching closing parenthesis
        while (i < css.length && depth > 0) {
          if (css[i] === "(") depth++;
          if (css[i] === ")") depth--;
          i++;
        }

        // Extract content between the outer parentheses
        const innerSelector = css.substring(start, i - 1);
        result += `${tagName}${innerSelector}`;
      }
      // Case 2: Plain :host (not a function)
      else {
        result += tagName;
      }
    }
    // Not a :host selector, just append the character and move on
    else {
      result += css[i];
      i++;
    }
  }

  return result;
}
