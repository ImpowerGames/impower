import { getCSSPropertyKeyValue } from "./getCSSPropertyKeyValue";

const getCSSSelector = (
  input: string,
  options?: {
    breakpoints?: Record<string, number>;
    scope?: string;
  }
) => {
  if (!input) {
    return "";
  }
  if (input === options?.scope) {
    return "";
  }

  const attributeRegex = /(\[)(.*?)($|\])/uy;
  const pseudoFunctionRegex = /([@])([_\p{L}][_\p{L}0-9]+)?(\()(.*?)($|\))/uy;
  const pseudoSimpleRegex = /([@])([_\p{L}][_\p{L}0-9]+)/uy;
  const identifierRegex = /[_\p{L}][_\p{L}0-9]+/uy;
  const whitespaceRegex = /[ \t]+/uy;

  let output = "";
  let i = 0;

  while (i < input.length) {
    // Output attribute selector as is
    attributeRegex.lastIndex = i;
    const attributeMatch = attributeRegex.exec(input);
    if (attributeMatch) {
      output += attributeMatch[0];
      i = attributeRegex.lastIndex;
      continue;
    }

    // Expand pseudo function
    pseudoFunctionRegex.lastIndex = i;
    const pseudoFunctionMatch = pseudoFunctionRegex.exec(input);
    if (pseudoFunctionMatch) {
      const pseudo = pseudoFunctionMatch[2];
      const arg = pseudoFunctionMatch[4];
      if (pseudo && arg) {
        switch (pseudo) {
          case "language":
            output += `:lang(${arg})`;
            break;
          case "direction":
            output += `:dir(${arg})`;
            break;
          case "has":
            output += `:has(${getCSSSelector(arg, options)})`;
            break;
          case "screen":
            const breakpoint = options?.breakpoints?.[arg];
            const size = breakpoint != null ? `${breakpoint}px` : arg;
            output += `@container(max-width:${size})`;
            break;
          case "theme":
            output += `@media(prefers-color-scheme:${arg})`;
            break;
        }
      }
      i = pseudoFunctionRegex.lastIndex;
      continue;
    }

    // Expand pseudo class
    pseudoSimpleRegex.lastIndex = i;
    const pseudoSimpleMatch = pseudoSimpleRegex.exec(input);
    if (pseudoSimpleMatch) {
      const pseudo = pseudoSimpleMatch[2];
      if (pseudo) {
        switch (pseudo) {
          case "hovered":
            output += ":hover";
            break;
          case "focused":
            output += ":focus";
            break;
          case "pressed":
            output += ":active";
            break;
          case "disabled":
            output += ":disabled";
            break;
          case "enabled":
            output += ":enabled";
            break;
          case "checked":
            output += ":checked";
            break;
          case "unchecked":
            output += ":not(:checked)";
            break;
          case "required":
            output += ":required";
            break;
          case "valid":
            output += ":valid";
            break;
          case "invalid":
            output += ":invalid";
            break;
          case "readonly":
            output += ":read-only";
            break;
          case "first":
            output += ":first-child";
            break;
          case "last":
            output += ":last-child";
            break;
          case "only":
            output += ":only-child";
            break;
          case "odd":
            output += ":nth-child(odd)";
            break;
          case "even":
            output += ":nth-child(even)";
            break;
          case "empty":
            output += ":nth-child(empty)";
            break;
          case "blank":
            output += ":placeholder-shown";
            break;
          case "before":
            output += "::before";
            break;
          case "after":
            output += "::after";
            break;
          case "placeholder":
            output += "::placeholder";
            break;
          case "selection":
            output += "::selection";
            break;
          case "marker":
            output += "::marker";
            break;
          case "backdrop":
            output += "::backdrop";
            break;
          case "opened":
            output += `[open]`;
            break;
          case "initial":
            output += "@starting-style";
            break;
        }
      }
      i = pseudoSimpleRegex.lastIndex;
      continue;
    }

    // Unlike normal CSS, & is used to indicate a compound selector (since . is not allowed for our property names)
    if (input[i] === "&") {
      if (!input.slice(0, i).trim()) {
        // Using & at the start of the selector, so need to include & in output
        output += "&";
      } else {
        // Using & between two selectors, so trim any whitespace before &
        output = output.trimEnd();
      }
      i++;
      // Swallow any whitespace following &
      whitespaceRegex.lastIndex = i;
      const whitespaceMatch = whitespaceRegex.exec(input);
      if (whitespaceMatch) {
        i = whitespaceRegex.lastIndex;
      }
      continue;
    }

    // Unlike normal CSS, # is used to indicate root selector &
    if (input[i] === "#") {
      output += "&";
      i++;
      continue;
    }

    // Prefix class identifier with .
    identifierRegex.lastIndex = i;
    const identifierMatch = identifierRegex.exec(input);
    if (identifierMatch) {
      output += "." + identifierMatch[0];
      i = identifierRegex.lastIndex;
      continue;
    }

    // Append char as is
    output += input[i];
    i++;
  }

  if (output.startsWith(":") || output.startsWith("[")) {
    // Pseudo and attribute selectors should target the root element by default
    // (if they aren't already targeting a child element)
    output = "&" + output;
  }

  return output;
};

export const getStyleContent = (
  styles: Record<string, any>,
  options?: {
    breakpoints?: Record<string, number>;
    scope?: string;
  }
): string => {
  const scope = options?.scope;
  const scopeSelector = scope ? scope + " " : "";
  let textContent = "";
  Object.entries(styles).forEach(([name, style]) => {
    let styleContent = "";
    const nestedEntries: [string, any][] = [];
    Object.entries(style).forEach(([k, v]) => {
      if (!k.startsWith("$") && k !== "target") {
        if (v && typeof v === "object" && !("$name" in v)) {
          nestedEntries.push([k, v]);
        } else {
          const [cssProp, cssValue] = getCSSPropertyKeyValue(k, v);
          if (cssValue) {
            styleContent += `\n  ${cssProp}: ${cssValue};`;
          }
        }
      }
    });
    // Process Nested CSS
    nestedEntries.forEach(([k, v]) => {
      const elementSelector = getCSSSelector(k, options);
      let nestedStyleContent = "";
      Object.entries(v).forEach(([nk, nv]) => {
        if (!nk.startsWith("$")) {
          const [cssProp, cssValue] = getCSSPropertyKeyValue(nk, nv);
          if (cssValue) {
            nestedStyleContent += `\n    ${cssProp}: ${cssValue};`;
          }
        }
      });
      nestedStyleContent = nestedStyleContent.trim();
      if (nestedStyleContent) {
        styleContent += `\n  ${elementSelector} {\n    ${nestedStyleContent}\n  }\n`;
      }
    });
    // Concatenate all
    styleContent = styleContent.trim();
    if (styleContent) {
      const elementSelector = getCSSSelector(name, options);
      textContent += `${scopeSelector}${elementSelector} {\n  ${styleContent}\n}\n`;
    }
  });
  textContent = textContent.trim();
  return textContent;
};
