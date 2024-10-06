import { getCSSPropertyKeyValue } from "./getCSSPropertyKeyValue";

const getCSSSelector = (
  input: string,
  breakpoints: Record<string, number> | undefined
) => {
  const identifierRegex = /[_\p{L}][_\p{L}0-9]+/uy;
  const whitespaceRegex = /[ \t]+/uy;
  let output = "";
  let i = 0;

  while (i < input.length) {
    // Expand pseudo shorthand
    if (input[i] === "@") {
      let pseudo = "";
      let arg = "";
      i++;
      while (i < input.length) {
        if (input[i] === " " || input[i] === "\t") {
          break;
        }
        if (input[i] === "(") {
          i++;
          while (i < input.length) {
            if (input[i] === ")") {
              break;
            }
            arg += input[i];
            i++;
          }
          break;
        }
        pseudo += input[i];
        i++;
      }
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
        case "language":
          output += `:lang(${arg})`;
          break;
        case "direction":
          output += `:dir(${arg})`;
          break;
        case "has":
          output += `:has(${getCSSSelector(arg, breakpoints)})`;
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
        case "initial":
          output += "@starting-style";
          break;
        case "screen":
          const breakpoint = breakpoints?.[arg];
          if (breakpoint != null) {
            output += `@container(max-width:${breakpoint}px)`;
          }
          break;
        case "theme":
          output += `@media(prefers-color-scheme:${arg})`;
          break;
        case "opened":
          output += `[open]`;
          break;
      }
      i++;
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

  return output;
};

export const getStyleContent = (
  styles: Record<string, any>,
  options?: {
    breakpoints?: Record<string, number>;
    scope?: string;
  }
): string => {
  const breakpoints = options?.breakpoints;
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
      const elementSelector = getCSSSelector(k, breakpoints);
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
      const elementSelector = getCSSSelector(name, breakpoints);
      textContent += `${scopeSelector}${elementSelector} {\n  ${styleContent}\n}\n`;
    }
  });
  textContent = textContent.trim();
  return textContent;
};
