export interface SparkleNode {
  root: "screen" | "component" | "style" | "animation" | "theme";
  type: string;
  args?: Record<string, any>;
  children?: SparkleNode[];
}

const INDENT_REGEX = /^[ \t]*/;
const NEWLINE_REGEX = /\r\n|\r|\n/;
const ESCAPED_QUOTE_REGEX = /\\(["'])/g;
const CONTENT_ATTRIBUTE_REGEX = /^"(.+)"$/;
const QUOTED_ATTRIBUTE_REGEX = /^(@?[\w-]+)=\"(.*)\"$/;
const UNQUOTED_ATTRIBUTE_REGEX = /^(@?[\w-]+)=(\S*)$/;
const BOOLEAN_ATTRIBUTE_REGEX = /^([\w-]+)$/;
const DECLARATION_REGEX =
  /^(screen|component|style|animation|theme)(?:$|\s+)($|.+)/;
const KEYWORD_FIELD_REGEX =
  /^([\w-]+)($|(?:[.][\w-]*)*)?(?:[(](.*)[)])?(?:$|\s+)($|.+)/;
const FOR_ARGUMENTS_REGEX = /^(.+?)(?:\s+)(?:in)(?:$|\s+)($|.+)$/;
const PROPERTY_VALUE_REGEX = /^([-]\s+)?([\w-]+)(?:\s*)(?:[=])(?:$|\s+)($|.+)$/;

const PARAMETER_SEPARATORS = [","];
const ATTRIBUTE_SEPARATORS = [" ", "\t"];

// TODO: output diagnostics
export function parseSparkle(input: string): SparkleNode[] {
  const rawLines = input.split(NEWLINE_REGEX);

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
      if (!currentRoot) {
        let match: RegExpMatchArray | null = null;
        if ((match = statement.match(DECLARATION_REGEX))) {
          const declarationKeyword = match?.[1] || "";
          const assignment = match?.[2] || "";
          const assignmentMatch = assignment.match(KEYWORD_FIELD_REGEX);
          const type = assignmentMatch?.[1] || "";
          const classesString = assignmentMatch?.[2] || "";
          const classes = classesString.split(".");
          const parameterString = (assignmentMatch?.[3] || "").trim();
          const parameters = splitArgs(parameterString, PARAMETER_SEPARATORS);
          if (declarationKeyword === "screen") {
            // Root is a Screen
            currentRoot = {
              root: "screen",
              type: "screen",
              args: { name: type, classes },
            };
            nodes.push(currentRoot);
            stack.length = 0;
            stack.push({ node: currentRoot, indent });
          } else if (declarationKeyword === "component") {
            // Root is a Component
            currentRoot = {
              root: "component",
              type: "component",
              args: { name: type, classes, parameters },
            };
            nodes.push(currentRoot);
            stack.length = 0;
            stack.push({ node: currentRoot, indent });
          } else if (declarationKeyword === "style") {
            // Root is a Style
            currentRoot = {
              root: "style",
              type: "style",
              args: { name: type },
            };
            nodes.push(currentRoot);
            stack.length = 0;
            stack.push({ node: currentRoot, indent });
          } else if (declarationKeyword === "animation") {
            // Root is a Animation
            currentRoot = {
              root: "animation",
              type: "animation",
              args: { name: type },
            };
            nodes.push(currentRoot);
            stack.length = 0;
            stack.push({ node: currentRoot, indent });
          } else if (declarationKeyword === "theme") {
            // Root is a Theme
            currentRoot = {
              root: "theme",
              type: "theme",
              args: { name: type },
            };
            nodes.push(currentRoot);
            stack.length = 0;
            stack.push({ node: currentRoot, indent });
          }
        }
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
          const match = statement.match(KEYWORD_FIELD_REGEX);
          const type = match?.[1] || "";
          const classesString = match?.[2] || "";
          const classes = classesString.split(".");
          const parameterString = (match?.[3] || "").trim();
          const parameters = splitArgs(parameterString, PARAMETER_SEPARATORS);
          const attributesString = (match?.[4] || "").trim();
          const attributeArray = splitArgs(
            attributesString,
            ATTRIBUTE_SEPARATORS
          );

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
            const match = attributesString.match(FOR_ARGUMENTS_REGEX);
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
            const attributes = parseAttributes(attributeArray);
            node = {
              root: currentRoot.root,
              type,
              args: {
                classes,
                parameters,
                attributes,
              },
            };
          }
        } else if (currentRoot?.type === "style") {
          let match: RegExpMatchArray | null = null;
          if (
            !trimmedLine.endsWith(":") &&
            (match = statement.match(PROPERTY_VALUE_REGEX))
          ) {
            const key = match?.[2] || "";
            const value = match?.[3] || "";
            node = {
              root: currentRoot.root,
              type: "property",
              args: { key: key?.trim(), value: value?.trim() },
            };
          } else {
            node = {
              root: currentRoot.root,
              type: statement,
            };
          }
        } else if (currentRoot?.type === "animation") {
          let match: RegExpMatchArray | null = null;
          if (
            !trimmedLine.endsWith(":") &&
            (match = statement.match(PROPERTY_VALUE_REGEX))
          ) {
            const itemMark = match?.[1] || "";
            const key = match?.[2] || "";
            const value = match?.[3] || "";
            if (itemMark) {
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
            }
            node = {
              root: currentRoot.root,
              type: "property",
              args: { key: key?.trim(), value: value?.trim() },
            };
          } else {
            node = {
              root: currentRoot.root,
              type: statement,
            };
          }
        } else if (currentRoot?.type === "theme") {
          let match: RegExpMatchArray | null = null;
          if (
            !trimmedLine.endsWith(":") &&
            (match = statement.match(PROPERTY_VALUE_REGEX))
          ) {
            const key = match?.[2] || "";
            const value = match?.[3] || "";
            node = {
              root: currentRoot.root,
              type: "property",
              args: { key: key?.trim(), value: value?.trim() },
            };
          } else {
            node = {
              root: currentRoot.root,
              type: statement,
            };
          }
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

export function getComponents(parsed: SparkleNode[]) {
  const components: Record<string, SparkleNode> = {};
  for (const root of parsed) {
    if (root.type === "component") {
      const name = root.args?.name;
      if (name) {
        components[name] = root;
      }
    }
  }
  return components;
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
  return str.replace(ESCAPED_QUOTE_REGEX, "$1");
}

function parseAttributes(args: string[]) {
  const params: Record<string, any> = {};
  for (const arg of args) {
    let match: RegExpMatchArray | null = null;
    if ((match = arg.match(CONTENT_ATTRIBUTE_REGEX))) {
      const [, content] = match;
      params["content"] = unescapeQuotes(content);
    } else if ((match = arg.match(QUOTED_ATTRIBUTE_REGEX))) {
      const [, key, value] = match;
      params[key!] = parseValue(unescapeQuotes(value));
    } else if ((match = arg.match(UNQUOTED_ATTRIBUTE_REGEX))) {
      const [, key, value] = match;
      params[key!] = parseValue(value);
    } else if ((match = arg.match(BOOLEAN_ATTRIBUTE_REGEX))) {
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
