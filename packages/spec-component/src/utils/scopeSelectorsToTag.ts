/**
 * Scopes all selectors within a full CSS string to a specific tag name.
 * It identifies CSS rule blocks and processes the selector lists,
 * handling complex, multiline, and nested pseudo-class selectors.
 *
 * @param css - The full CSS string containing rules (e.g., '.class { color: red; }').
 * @param tagName - The tag name to scope to (e.g., 'my-component').
 * @returns The transformed CSS string with all selectors scoped.
 */
export function scopeSelectorsToTag(css: string, tagName: string): string {
  let result = "";
  let i = 0;

  while (i < css.length) {
    const openBrace = css.indexOf("{", i);

    // If no more blocks are found, append the rest of the string
    if (openBrace === -1) {
      result += css.substring(i);
      break;
    }

    // Extract the selector portion before the '{'
    const rawSelector = css.substring(i, openBrace);
    const scopedSelector = transformSelectorList(rawSelector, tagName);

    // Find the matching closing brace for this block
    // We skip the content of the block to avoid processing properties
    let closeBrace = openBrace;
    let braceDepth = 0;
    for (let j = openBrace; j < css.length; j++) {
      if (css[j] === "{") braceDepth++;
      if (css[j] === "}") braceDepth--;
      if (braceDepth === 0) {
        closeBrace = j;
        break;
      }
    }

    // Append the scoped selector and the original block content
    result += scopedSelector + css.substring(openBrace, closeBrace + 1);
    i = closeBrace + 1;
  }

  return result;
}

/**
 * Internal helper to process a comma-separated selector list.
 */
function transformSelectorList(selector: string, tagName: string): string {
  const parts: string[] = [];
  let currentPart = "";

  let parenDepth = 0;
  let bracketDepth = 0;
  let stringChar: string | null = null;
  let isEscaped = false;

  for (let i = 0; i < selector.length; i++) {
    const char = selector[i];

    if (isEscaped) {
      currentPart += char;
      isEscaped = false;
      continue;
    }

    if (char === "\\") {
      isEscaped = true;
      currentPart += char;
      continue;
    }

    if (stringChar) {
      if (char === stringChar) stringChar = null;
      currentPart += char;
      continue;
    }

    if (char === '"' || char === "'") {
      stringChar = char;
      currentPart += char;
      continue;
    }

    if (char === "(") parenDepth++;
    else if (char === ")") parenDepth--;
    else if (char === "[") bracketDepth++;
    else if (char === "]") bracketDepth--;

    if (char === "," && parenDepth === 0 && bracketDepth === 0) {
      parts.push(currentPart);
      currentPart = "";
    } else {
      currentPart += char;
    }
  }

  if (currentPart) {
    parts.push(currentPart);
  }

  return parts
    .map((part) => {
      const match = part.match(/^(\s*)(.*)$/);
      if (!match) return part;

      const [, leadingWhitespace, actualSelector] = match;
      const trimmedSelector = actualSelector?.trim();

      if (!trimmedSelector) return leadingWhitespace;

      // Heuristic: Attributes, pseudo-classes, classes, and IDs attach directly.
      const attachDirectly = /^[\[:.#]/.test(trimmedSelector);
      const separator = attachDirectly ? "" : " ";

      return `${leadingWhitespace}${tagName}${separator}${trimmedSelector}`;
    })
    .join(",");
}
