export interface Node {
  root: "screen" | "component" | "style" | "animation";
  type: string;
  params?: Record<string, any>;
  children?: Node[];
}

export interface BuiltinDefinition {
  begin: string;
  end: string;
}

export interface ParseContext {
  screens?: Record<string, Node>;
  components?: Record<string, Node>;
  styles?: Record<string, Node>;
  animations?: Record<string, Node>;
}

const INDENT_REGEX: RegExp = /^[ \t]*/;

// TODO: output diagnostics
export function parseSSL(input: string): ParseContext {
  const rawLines = input.split(/\r\n|\r|\n/);

  const screens: Record<string, Node> = {};
  const components: Record<string, Node> = {};
  const styles: Record<string, Node> = {};
  const animations: Record<string, Node> = {};
  const stack: { node: Node; indent: number }[] = [];
  let currentRoot: Node | null = null;

  for (let i = 0; i < rawLines.length; i++) {
    const rawLine = rawLines[i]!;

    // Determine indent level
    const indentMatch = rawLine.match(INDENT_REGEX);
    const currentIndentation = indentMatch?.[0] || "";
    const indent = currentIndentation.length;

    // Get trimmed statement
    const trimmedLine = rawLine.trim();
    const statement = trimmedLine.endsWith(":")
      ? trimmedLine.slice(0, -1).trim()
      : trimmedLine;

    if (trimmedLine) {
      // Split statement into type and args
      const [nodeType, ...args] = splitAttrArgs(statement);
      if (nodeType === "screen") {
        // Root is a Screen
        const match = statement.match(/^screen\s+(\w+)(?:[.](\w+))?$/);
        if (!match) {
          console.warn(`invalid screen syntax:`, statement);
          continue;
        }
        const [, keyOrBase, key] = match;
        const base = key ? keyOrBase : "";
        const name = key ? key : keyOrBase;
        currentRoot = {
          root: "screen",
          type: "screen",
          params: { base, name },
        };
        screens[name] = currentRoot;
        stack.length = 0;
        stack.push({ node: currentRoot, indent });
      } else if (nodeType === "component") {
        // Root is a Component
        const match = statement.match(/^component\s+(\w+)(?:[.](\w+))?$/);
        if (!match) {
          console.warn(`invalid component syntax:`, statement);
          continue;
        }
        const [, keyOrBase, key] = match;
        const base = key ? keyOrBase : "";
        const name = key ? key : keyOrBase;
        currentRoot = {
          root: "component",
          type: "component",
          params: { base, name },
        };
        components[name] = currentRoot;
        stack.length = 0;
        stack.push({ node: currentRoot, indent });
      } else if (nodeType === "style") {
        // Root is a Style
        const match = statement.match(/^style\s+(\w+)(?:[.](\w+))?$/);
        if (!match) {
          console.warn(`invalid style syntax:`, statement);
          continue;
        }
        const [, keyOrBase, key] = match;
        const base = key ? keyOrBase : "";
        const name = key ? key : keyOrBase;
        currentRoot = {
          root: "style",
          type: "style",
          params: { base, name },
        };
        styles[name] = currentRoot;
        stack.length = 0;
        stack.push({ node: currentRoot, indent });
      } else if (nodeType === "animation") {
        // Root is a Style
        const match = statement.match(/^animation\s+(\w+)(?:[.](\w+))?$/);
        if (!match) {
          console.warn(`invalid animation syntax:`, statement);
          continue;
        }
        const [, keyOrBase, key] = match;
        const base = key ? keyOrBase : "";
        const name = key ? key : keyOrBase;
        currentRoot = {
          root: "animation",
          type: "animation",
          params: { base, name },
        };
        animations[name] = currentRoot;
        stack.length = 0;
        stack.push({ node: currentRoot, indent });
      } else {
        // Determine parent from indentation
        while (stack.length > 0 && indent <= stack.at(-1)!.indent) {
          stack.pop();
        }
        const parent = stack.at(-1)?.node;
        if (!parent) {
          currentRoot = null;
          continue;
        }

        // Get child node
        let node: Node | null = null;
        if (
          currentRoot?.type === "screen" ||
          currentRoot?.type === "component"
        ) {
          // Determine child node type
          if (nodeType === "if") {
            const condition = args.join(" ").trim();
            node = {
              root: currentRoot.root,
              type: nodeType,
              params: { condition },
            };
          } else if (nodeType === "elseif") {
            const condition = args.join(" ").trim();
            node = {
              root: currentRoot.root,
              type: nodeType,
              params: { condition },
            };
          } else if (nodeType === "else") {
            node = {
              root: currentRoot.root,
              type: nodeType,
            };
          } else if (nodeType === "match") {
            const expression = args.join(" ").trim();
            node = {
              root: currentRoot.root,
              type: nodeType,
              params: { expression },
            };
          } else if (nodeType.startsWith("case")) {
            const value = args.join(" ").trim();
            node = {
              root: currentRoot.root,
              type: nodeType,
              params: { value },
            };
          } else if (nodeType === "for") {
            const match = statement.match(/^for\s+(.+?)\s+in\s+(.+)$/);
            if (!match) {
              console.warn(`invalid ${nodeType} syntax:`, statement);
              continue;
            }
            const as = match[1].trim();
            const each = match[2].trim();
            node = {
              root: currentRoot.root,
              type: nodeType,
              params: { as, each },
            };
          } else if (nodeType === "repeat") {
            const times = args.join(" ").trim();
            node = {
              root: currentRoot.root,
              type: nodeType,
              params: { times },
            };
          } else if (nodeType === "slot") {
            const name = args[0];
            node = {
              root: currentRoot.root,
              type: nodeType,
              params: { name },
            };
          } else if (nodeType === "fill") {
            const name = args[0];
            node = {
              root: currentRoot.root,
              type: nodeType,
              params: { name },
            };
          } else if (nodeType) {
            const params = parseParams(args);
            node = {
              root: currentRoot.root,
              type: nodeType,
              params: params,
            };
          }
        } else if (currentRoot?.type === "style") {
          if (nodeType.startsWith("@")) {
            node = {
              root: currentRoot.root,
              type: nodeType,
            };
          } else {
            const value = args.join(" ").split("=")[1]?.trimStart();
            node = {
              root: currentRoot.root,
              type: nodeType,
              params: { value },
            };
          }
        }

        // Add node to parent's children and to the stack
        if (node) {
          parent.children ??= [];
          parent.children.push(node);
          stack.push({ node: node, indent });
        }
      }
    }
  }

  return {
    screens,
    components,
    styles,
    animations,
  };
}

function splitAttrArgs(input: string): string[] {
  const regex = /(\w+=".*?"|\w+=\S+|".*?"|\S+)/g;
  const result: string[] = [];

  let match: RegExpExecArray | null;
  while ((match = regex.exec(input)) !== null) {
    // If the match is quoted (group 1), use that, otherwise the whole match
    result.push(match[1] !== undefined ? match[1] : match[0]);
  }

  return result;
}

function parseParams(args: string[]) {
  const params: Record<string, any> = {};
  for (const arg of args) {
    let match: RegExpMatchArray | null = null;
    if ((match = arg.match(/^"(.+)"$/))) {
      const [, label] = match;
      params["label"] = label;
    } else if (
      (match = arg.match(/^(@?[\w-]+)=\"(.*?)\"$/)) ||
      (match = arg.match(/^(@?[\w-]+)=(\S+)$/))
    ) {
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
