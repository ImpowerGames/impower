export function scopeSelectorsToTag(css: string, tagName: string): string {
  let result = "";
  let i = 0;

  while (i < css.length) {
    const openBrace = css.indexOf("{", i);

    if (openBrace === -1) {
      result += css.substring(i);
      break;
    }

    const rawSelector = css.substring(i, openBrace);
    const scopedSelector = transformSelectorList(rawSelector, tagName);

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

    result += scopedSelector + css.substring(openBrace, closeBrace + 1);
    i = closeBrace + 1;
  }

  return result;
}

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

      const attachDirectly = /^[\[:.#]/.test(trimmedSelector);
      const separator = attachDirectly ? "" : " ";

      return `${leadingWhitespace}${tagName}${separator}${trimmedSelector}`;
    })
    .join(",");
}
