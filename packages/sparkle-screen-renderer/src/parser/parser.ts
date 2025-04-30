export interface SparkleNode {
  root: "screen" | "component" | "style" | "animation" | "theme";
  type: string;
  args?: Record<string, any>;
  children?: SparkleNode[];
}

const INDENT_REGEX: RegExp = /^[ \t]*/;
const PARAMETER_SEPARATORS = [","];
const ATTRIBUTE_SEPARATORS = [" ", "\t"];

// TODO: output diagnostics
export function parseSparkle(input: string): SparkleNode[] {
  const rawLines = input.split(/\r\n|\r|\n/);

  const nodes: SparkleNode[] = [];
  const stack: { node: SparkleNode; indent: number }[] = [];
  let currentRoot: SparkleNode | null = null;

  for (let i = 0; i < rawLines.length; i++) {
    const rawLine = rawLines[i]!;

    // Determine indent level
    const indentMatch = rawLine.match(INDENT_REGEX);
    const currentIndentation = indentMatch?.[0] || "";
    let indent = currentIndentation.length;

    if (indent === 0) {
      // TODO: Support blank lines
      currentRoot = null;
    }

    // Get trimmed statement
    const trimmedLine = rawLine.trim();
    const statement = trimmedLine.endsWith(":")
      ? trimmedLine.slice(0, -1).trim()
      : trimmedLine;

    if (trimmedLine) {
      // Split statement into tokens
      const match = statement.match(
        /^(?:(screen|component|style|animation|theme)?(?:$|\s+))?([\w-]+)($|(?:[.][\w-]*)*)?(?:[(](.*)[)])?(?:$|\s+)($|.+)/
      );
      const declarationKeyword = match?.[1] || "";
      const type = match?.[2] || "";
      const classesString = match?.[3] || "";
      const classes = classesString.split(".");
      const parameterString = (match?.[4] || "").trim();
      const parameters = splitArgs(parameterString, PARAMETER_SEPARATORS);
      const attributesString = (match?.[5] || "").trim();
      const attributes = splitArgs(attributesString, ATTRIBUTE_SEPARATORS);
      if (!currentRoot && declarationKeyword === "screen") {
        // Root is a Screen
        currentRoot = {
          root: "screen",
          type: "screen",
          args: { name: type, classes },
        };
        nodes.push(currentRoot);
        stack.length = 0;
        stack.push({ node: currentRoot, indent });
      } else if (!currentRoot && declarationKeyword === "component") {
        // Root is a Component
        currentRoot = {
          root: "component",
          type: "component",
          args: { name: type, classes, parameters },
        };
        nodes.push(currentRoot);
        stack.length = 0;
        stack.push({ node: currentRoot, indent });
      } else if (!currentRoot && declarationKeyword === "style") {
        // Root is a Style
        currentRoot = {
          root: "style",
          type: "style",
          args: { name: type },
        };
        nodes.push(currentRoot);
        stack.length = 0;
        stack.push({ node: currentRoot, indent });
      } else if (!currentRoot && declarationKeyword === "animation") {
        // Root is a Animation
        currentRoot = {
          root: "animation",
          type: "animation",
          args: { name: type },
        };
        nodes.push(currentRoot);
        stack.length = 0;
        stack.push({ node: currentRoot, indent });
      } else if (!currentRoot && declarationKeyword === "theme") {
        // Root is a Theme
        currentRoot = {
          root: "theme",
          type: "theme",
          args: { name: type },
        };
        nodes.push(currentRoot);
        stack.length = 0;
        stack.push({ node: currentRoot, indent });
      } else {
        // Determine parent from indentation
        while (stack.length > 0 && indent <= stack.at(-1)!.indent) {
          stack.pop();
        }
        let parent = stack.at(-1)?.node;
        if (!parent) {
          currentRoot = null;
          continue;
        }

        // Get child node
        let node: SparkleNode | null = null;
        if (
          currentRoot?.type === "screen" ||
          currentRoot?.type === "component"
        ) {
          // Determine child node type
          if (type === "if") {
            const condition = attributesString;
            node = {
              root: currentRoot.root,
              type,
              args: { condition },
            };
          } else if (type === "elseif") {
            const condition = attributesString;
            node = {
              root: currentRoot.root,
              type,
              args: { condition },
            };
          } else if (type === "else") {
            node = {
              root: currentRoot.root,
              type,
            };
          } else if (type === "match") {
            const expression = attributesString;
            node = {
              root: currentRoot.root,
              type,
              args: { expression },
            };
          } else if (type.startsWith("case")) {
            const value = attributesString;
            node = {
              root: currentRoot.root,
              type,
              args: { value },
            };
          } else if (type === "for") {
            const match = attributesString.match(/^(.+?)\s+in\s+(.+)$/);
            if (!match) {
              console.warn(`invalid ${type} syntax:`, statement);
              continue;
            }
            const asString = match[1].trim();
            const as = asString.split(",").map((a) => a.trim());
            const each = match[2].trim();
            node = {
              root: currentRoot.root,
              type,
              args: { as, each },
            };
          } else if (type === "repeat") {
            const times = attributesString;
            node = {
              root: currentRoot.root,
              type,
              args: { times },
            };
          } else if (type === "slot") {
            const name = attributesString;
            node = {
              root: currentRoot.root,
              type,
              args: { name },
            };
          } else if (type === "fill") {
            const name = attributesString;
            node = {
              root: currentRoot.root,
              type,
              args: { name },
            };
          } else if (type) {
            // Use of builtin or custom component
            const parsedAttributes = parseAttributes(attributes);
            node = {
              root: currentRoot.root,
              type,
              args: {
                classes,
                parameters,
                attributes: parsedAttributes,
              },
            };
          }
        } else if (currentRoot?.type === "style") {
          if (trimmedLine.endsWith(":") || type.match(/^[^a-zA-Z-]/)) {
            node = {
              root: currentRoot.root,
              type,
            };
          } else {
            const value = statement.split("=")[1]?.trimStart();
            node = {
              root: currentRoot.root,
              type: "prop",
              args: { key: type, value },
            };
          }
        } else if (currentRoot?.type === "animation") {
          if (type === "-") {
            const itemNode: SparkleNode = {
              root: currentRoot.root,
              type: "item",
            };
            parent.children ??= [];
            parent.children.push(itemNode);
            indent = indent + 1;
            stack.push({ node: itemNode, indent });
            parent = itemNode;
            indent = indent + 2;
            const [key, value] = attributesString.split("=");
            node = {
              root: currentRoot.root,
              type: "prop",
              args: {
                key: key?.trim(),
                value: value?.trim(),
              },
            };
          } else if (type === "keyframes") {
            node = {
              root: currentRoot.root,
              type: "keyframes",
            };
          } else if (type === "timing") {
            node = {
              root: currentRoot.root,
              type: "timing",
            };
          } else {
            const [key, value] = statement.split("=");
            node = {
              root: currentRoot.root,
              type: "prop",
              args: { key: key?.trim(), value: value?.trim() },
            };
          }
        } else if (currentRoot?.type === "theme") {
        }

        // Add node to parent's children and to the stack
        if (node) {
          parent.children ??= [];
          parent.children.push(node);
          stack.push({ node, indent });
        }
      }
    }
  }

  return nodes;
}

function splitArgs(input: string, separators: string[]): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  let quoteChar = "";
  let i = 0;

  while (i < input.length) {
    const char = input[i];

    if (inQuotes) {
      if (char === "\\") {
        if (i + 1 < input.length) {
          current += char + input[i + 1];
          i += 2;
          continue;
        }
      } else if (char === quoteChar) {
        inQuotes = false;
      }
      current += char;
    } else {
      if (char === '"' || char === "'") {
        inQuotes = true;
        quoteChar = char;
        current += char;
      } else if (separators.includes(char)) {
        if (current.length > 0) {
          result.push(current);
          current = "";
        }
      } else {
        current += char;
      }
    }

    i++;
  }

  if (current.length > 0) {
    result.push(current);
  }

  return result.map((r) => r.trim());
}

function unescapeQuotes(str: string): string {
  if (
    (str.startsWith('"') && str.endsWith('"')) ||
    (str.startsWith("'") && str.endsWith("'"))
  ) {
    str = str.slice(1, -1);
  }
  return str.replace(/\\(["'])/g, "$1");
}

function parseAttributes(args: string[]) {
  const params: Record<string, any> = {};
  for (const arg of args) {
    let match: RegExpMatchArray | null = null;
    if ((match = arg.match(/^"(.+)"$/))) {
      const [, content] = match;
      params["content"] = unescapeQuotes(content);
    } else if ((match = arg.match(/^(@?[\w-]+)=\"(.*?)\"$/))) {
      const [, key, value] = match;
      params[key!] = parseValue(unescapeQuotes(value));
    } else if ((match = arg.match(/^(@?[\w-]+)=(\S+)$/))) {
      const [, key, value] = match;
      params[key!] = parseValue(value);
    } else if ((match = arg.match(/^([\w-]+)$/))) {
      const [, key] = match;
      params[key!] = true;
    } else if (arg.trim()) {
      console.warn(`invalid attribute syntax:`, arg);
    }
  }
  return params;
}

function parseValue(value: string): unknown {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  if (value.includes(",")) {
    return value.split(",").map((v) => parseValue(v));
  }
  if (!Number.isNaN(Number(value))) {
    return Number(value);
  }
  return value ?? "";
}
