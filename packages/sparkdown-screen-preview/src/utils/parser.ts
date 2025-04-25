export interface Node {
  root: "screen" | "component" | "style" | "animation" | "theme";
  type: string;
  params?: Record<string, any>;
  children?: Node[];
}

export interface ParseContext {
  screens?: Record<string, Node>;
  components?: Record<string, Node>;
  styles?: Record<string, Node>;
  animations?: Record<string, Node>;
  themes?: Record<string, Node>;
}

const INDENT_REGEX: RegExp = /^[ \t]*/;

// TODO: output diagnostics
export function parseSSL(input: string): ParseContext {
  const rawLines = input.split(/\r\n|\r|\n/);

  const screens: Record<string, Node> = {};
  const components: Record<string, Node> = {};
  const styles: Record<string, Node> = {};
  const animations: Record<string, Node> = {};
  const themes: Record<string, Node> = {};
  const stack: { node: Node; indent: number }[] = [];
  let currentRoot: Node | null = null;

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
      // Split statement into type and args
      const [nodeType, ...args] = splitAttrArgs(statement);
      if (!currentRoot && nodeType === "screen") {
        // Root is a Screen
        const match = statement.match(/^screen\s+([\w-]+)(?:[.]([\w-]+))?$/);
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
      } else if (!currentRoot && nodeType === "component") {
        // Root is a Component
        const match = statement.match(/^component\s+([\w-]+)(?:[.]([\w-]+))?$/);
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
      } else if (!currentRoot && nodeType === "style") {
        // Root is a Style
        const match = statement.match(/^style\s+([\w-]+)$/);
        if (!match) {
          console.warn(`invalid style syntax:`, statement);
          continue;
        }
        const [, name] = match;
        currentRoot = {
          root: "style",
          type: "style",
          params: { name },
        };
        styles[name] = currentRoot;
        stack.length = 0;
        stack.push({ node: currentRoot, indent });
      } else if (!currentRoot && nodeType === "animation") {
        // Root is a Style
        const match = statement.match(/^animation\s+([\w-]+)$/);
        if (!match) {
          console.warn(`invalid animation syntax:`, statement);
          continue;
        }
        const [, name] = match;
        currentRoot = {
          root: "animation",
          type: "animation",
          params: { name },
        };
        animations[name] = currentRoot;
        stack.length = 0;
        stack.push({ node: currentRoot, indent });
      } else if (!currentRoot && nodeType === "theme") {
        // Root is a Style
        const match = statement.match(/^theme\s+([\w-]+)$/);
        if (!match) {
          console.warn(`invalid theme syntax:`, statement);
          continue;
        }
        const [, name] = match;
        currentRoot = {
          root: "theme",
          type: "theme",
          params: { name },
        };
        themes[name] = currentRoot;
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
            const value = statement.split("=")[1]?.trimStart();
            node = {
              root: currentRoot.root,
              type: "prop",
              params: { key: nodeType, value },
            };
          }
        } else if (currentRoot?.type === "animation") {
          if (nodeType === "-") {
            const itemNode: Node = { root: currentRoot.root, type: "item" };
            parent.children ??= [];
            parent.children.push(itemNode);
            indent = indent + 1;
            stack.push({ node: itemNode, indent });
            parent = itemNode;
            indent = indent + 2;
            const [key, value] = statement.split("=");
            node = {
              root: currentRoot.root,
              type: "prop",
              params: {
                key: key?.trim().slice(1)?.trim(),
                value: value?.trim(),
              },
            };
          } else if (nodeType === "keyframes") {
            node = {
              root: currentRoot.root,
              type: "keyframes",
            };
          } else if (nodeType === "timing") {
            node = {
              root: currentRoot.root,
              type: "timing",
            };
          } else {
            const [key, value] = statement.split("=");
            node = {
              root: currentRoot.root,
              type: "prop",
              params: { key: key?.trim(), value: value?.trim() },
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

  return {
    screens,
    components,
    styles,
    animations,
    themes,
  };
}

function splitAttrArgs(input: string): string[] {
  const regex = /([\w-]+=".*?"|[\w-]+=\S+|".*?"|\S+)/g;
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
