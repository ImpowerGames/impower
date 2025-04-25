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

export interface ParseOptions {
  builtins?: Record<string, BuiltinDefinition>;
  breakpoints?: Record<string, number>;
  attrAliases?: Record<string, string>;
  cssAliases?: Record<string, string>;
}

export interface ParseContext extends ParseOptions {
  screens?: Record<string, Node>;
  components?: Record<string, Node>;
  styles?: Record<string, Node>;
  animations?: Record<string, Node>;
}

export const DEFAULT_BUILTINS: Record<string, BuiltinDefinition> = {
  style: {
    begin: "{selector} \\{",
    end: "}",
  },
  animation: {
    begin: "@keyframes {name} \\{",
    end: "}",
  },
  screen: {
    begin: '<div class="style {classes}" {...attrs}>',
    end: "</div>",
  },
  component: {
    begin: '<div class="style {classes}" {...attrs}>',
    end: "</div>",
  },
  "": {
    begin: '<div class="style {classes}" {...attrs}>',
    end: "</div>",
  },
  Box: {
    begin: '<div class="style {classes}" {...attrs}>',
    end: "</div>",
  },
  Row: {
    begin: '<div class="style {classes}" {...attrs}>',
    end: "</div>",
  },
  Column: {
    begin: '<div class="style {classes}" {...attrs}>',
    end: "</div>",
  },
  Grid: {
    begin: '<div class="style {classes}" {...attrs}>',
    end: "</div>",
  },
  Label: {
    begin: '<div class="style {classes}" {...attrs}>{{label}}',
    end: "</div>",
  },
  Button: {
    begin: '<button class="style {classes}" {...attrs}>{{label}}',
    end: "</button>",
  },
  Image: {
    begin: '<img class="style {classes}" {...attrs}>',
    end: "</img>",
  },
  Input: {
    begin: `
<label class="style InputGroup">
  <span class="style Label">{{label}}</span>
  <input class="style {classes}" type="text" {...attrs}/>
`,
    end: `
</label>
`,
  },
  Slider: {
    begin: `
<label class="style InputGroup">
  <span class="style Label">{{label}}</span>
  <input class="style {classes}" type="range" style="--fill-percentage: 50%;" oninput="this.style.setProperty('--fill-percentage', (this.value - this.min) / (this.max - this.min) * 100 + '%')" {...attrs}/>
`,
    end: `
</label>
`,
  },
  Checkbox: {
    begin: `
<label class="style InputGroup">
  <input class="style {classes}" type="checkbox" {...attrs}/>
  <span class="style Label">{{label}}</span>
`,
    end: `
</label>
`,
  },
  Dropdown: {
    begin: `
<label class="style InputGroup">
  <span class="style Label">{{label}}</span>
  <div class="style DropdownArrow">
    <select class="style {classes}" {...attrs}>
`,
    end: `
    </select>
  </div>
</label>
`,
  },
  Option: {
    begin: '<option class="style {classes}" {...attrs}>',
    end: "</option>",
  },
  Space: {
    begin: '<div class="style {classes}" {...attrs}>',
    end: "</div>",
  },
} as const;

const SELECTOR_SIMPLE_CONDITION_NAMES = [
  "hovered",
  "focused",
  "pressed",
  "disabled",
  "enabled",
  "checked",
  "unchecked",
  "required",
  "valid",
  "invalid",
  "readonly",
  "first",
  "last",
  "only",
  "odd",
  "even",
  "empty",
  "blank",
  "opened",
  "before",
  "after",
  "placeholder",
  "selection",
  "marker",
  "backdrop",
  "initial",
];

const SELECTOR_FUNCTION_CONDITION_NAMES = [
  "language",
  "direction",
  "has",
  "theme",
  "screen-size",
  "container-size",
];

const DEFAULT_ATTR_ALIASES = {
  "focus-order": "tab-index",
};

const DEFAULT_CSS_ALIASES = {
  easing: "animation-timing-function",
  iterations: "animation-iteration-count",
  duration: "animation-duration",
  delay: "animation-delay",
};

const DEFAULT_BREAKPOINTS = {
  xs: 400,
  sm: 600,
  md: 960,
  lg: 1280,
  xl: 1920,
};

const INDENT_REGEX: RegExp = /^[ \t]*/;

const EMPTY_OBJ = {};

// TODO: output diagnostics
export function parseSSL(input: string, options?: ParseOptions): ParseContext {
  const builtins = options?.builtins ?? DEFAULT_BUILTINS;
  const breakpoints = options?.breakpoints ?? DEFAULT_BREAKPOINTS;
  const attrAliases = options?.attrAliases ?? DEFAULT_ATTR_ALIASES;
  const cssAliases = options?.cssAliases ?? DEFAULT_CSS_ALIASES;

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
          // Determine child node type
          if (SELECTOR_SIMPLE_CONDITION_NAMES.includes(nodeType)) {
            node = {
              root: currentRoot.root,
              type: nodeType,
            };
          } else if (SELECTOR_FUNCTION_CONDITION_NAMES.includes(nodeType)) {
            node = {
              root: currentRoot.root,
              type: nodeType,
              params: { args },
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
    builtins,
    breakpoints,
    attrAliases,
    cssAliases,
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

function splitSelectorArgs(input: string): string[] {
  const [name, afterOpenParen] = input.split("(");
  if (afterOpenParen) {
    const lastCloseParen = afterOpenParen.lastIndexOf(")");
    if (lastCloseParen >= 0) {
      const arg = afterOpenParen.slice(0, lastCloseParen);
      return [name, arg];
    }
  }
  return [name];
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

export interface RenderContext {
  parsed: ParseContext;
  state: Record<string, any>;
  scope?: Record<string, any>;
  renderStyles: () => void;
  renderHTML: () => void;
  indent?: number;
}

export function renderElements(
  el: Node,
  ctx: RenderContext,
  parent?: Node,
  index: number = 0,
  indentLevel = 0
): string[] {
  const { type, params, children } = el;

  const components = ctx.parsed.components;
  const styles = ctx.parsed.styles;
  const animations = ctx.parsed.animations;
  const builtins = ctx.parsed.builtins ?? DEFAULT_BUILTINS;
  const breakpoints = ctx.parsed.breakpoints ?? DEFAULT_BREAKPOINTS;
  const attrAliases = ctx.parsed.attrAliases ?? DEFAULT_ATTR_ALIASES;
  const cssAliases = ctx.parsed.cssAliases ?? DEFAULT_CSS_ALIASES;

  switch (type) {
    case "if": {
      if (evaluate(el.params?.condition, getContext(ctx))) {
        return (
          el.children?.flatMap((child, i) =>
            renderElements(child, ctx, el, i)
          ) ?? []
        );
      }
      let siblingOffset = 1;
      let sibling = parent?.children?.[index + siblingOffset];
      while (
        sibling &&
        (sibling.type === "elseif" || sibling.type === "else")
      ) {
        if (
          sibling.type === "elseif" &&
          evaluate(sibling.params?.condition, getContext(ctx))
        ) {
          return (
            sibling.children?.flatMap((child, i) =>
              renderElements(child, ctx, sibling, i)
            ) || []
          );
        } else if (sibling.type === "else") {
          return (
            sibling.children?.flatMap((child, i) =>
              renderElements(child, ctx, sibling, i)
            ) || []
          );
        }
        siblingOffset++;
        sibling = parent?.children?.[index + siblingOffset];
      }
      return [];
    }
    case "elseif":
    case "else": {
      // These should be handled in their parent "if" block.
      return [];
    }
    case "for": {
      const list = evaluate(params?.each, getContext(ctx)) || [];
      const entries = Object.entries(list);

      const nextSibling = parent?.children?.[index + 1];
      const loopChildren = children;

      if (entries.length === 0 && nextSibling?.type === "else") {
        return (
          nextSibling.children?.flatMap((c, i) =>
            renderElements(c, ctx, nextSibling, i)
          ) ?? []
        );
      }

      const asKeys = params?.as.split(",").map((k: string) => k.trim());

      return entries.flatMap(([key, value]) => {
        let scopeVars: Record<string, any> = {};
        if (asKeys.length > 1) {
          scopeVars = {
            ...(asKeys[0] && { [asKeys[0]]: key }),
            ...(asKeys[1] && { [asKeys[1]]: value }),
          };
        } else {
          scopeVars = { [params?.as]: value };
        }
        const subCtx = {
          ...ctx,
          scope: { ...ctx.scope, ...scopeVars },
        };
        return (
          loopChildren?.flatMap((child, i) =>
            renderElements(child, subCtx, el, i)
          ) ?? []
        );
      });
    }
    case "repeat": {
      const times = evaluate<number>(params?.times, getContext(ctx));

      const nextSibling = parent?.children?.[index + 1];
      const loopChildren = children;

      if (Number.isNaN(times)) {
        return [];
      }

      if (times === 0 && nextSibling?.type === "else") {
        return (
          nextSibling.children?.flatMap((c, i) =>
            renderElements(c, ctx, nextSibling, i)
          ) ?? []
        );
      }

      return Array.from({ length: times }, (_, k) => k).flatMap((_, i) => {
        const subCtx = {
          ...ctx,
          scope: { ...(ctx.scope || EMPTY_OBJ), index: i },
        };
        return (
          loopChildren?.flatMap((child, j) =>
            renderElements(child, subCtx, el, j)
          ) ?? []
        );
      });
    }
    case "match": {
      const value = evaluate(params?.expression, getContext(ctx));
      if (children) {
        for (const child of children) {
          if (child.type === "case") {
            const caseValue = evaluate(child.params?.value, getContext(ctx));
            if (value === caseValue) {
              return (
                child.children?.flatMap((c, i) =>
                  renderElements(c, ctx, child, i)
                ) ?? []
              );
            }
          } else if (child.type === "else") {
            return (
              child.children?.flatMap((c, i) =>
                renderElements(c, ctx, child, i)
              ) ?? []
            );
          }
        }
      }
      return [];
    }
    case "case": {
      // These are handled by their parent match block.
      return [];
    }
    default: {
      if (type in builtins) {
        // Builtin component
        const component = builtins[type as keyof typeof builtins];
        const elementContext: Record<string, any> = {
          ...el.params,
        };
        const evalContext = getContext(ctx);
        if (el.root === "style") {
          elementContext["selector"] = ["." + type, el.params?.name]
            .filter(Boolean)
            .join(".");
        } else if (el.root === "animation") {
          elementContext["name"] = type;
        } else {
          const { base, name, ...rest } = params || {};
          const classNames =
            type === "component"
              ? getInheritanceChain(el.params?.base, builtins, components)
              : getInheritanceChain(type, builtins, components);
          elementContext["classes"] = [...classNames, base, name]
            .filter(Boolean)
            .join(" ");
          elementContext["attrs"] = Object.entries(rest).map(([k, v]) =>
            paramToAttr(k, v, evalContext, attrAliases)
          );
        }
        const beginTemplate = interpolate(
          component.begin,
          elementContext,
          attrAliases
        );
        const endTemplate = interpolate(
          component.end,
          elementContext,
          attrAliases
        );
        const begin = interpolate(beginTemplate, evalContext, attrAliases)
          .split("\n")
          .filter(Boolean);
        const end = interpolate(endTemplate, evalContext, attrAliases)
          .split("\n")
          .filter(Boolean);
        const content =
          children?.flatMap((child, i) => renderElements(child, ctx, el, i)) ??
          [];
        const isMultiline = begin.length > 1 || content.length > 1;
        if (isMultiline) {
          let startingInnerIndent =
            indentLevel + getIndentLevel(begin.at(-1) ?? "");
          return [
            ...begin.map((line) => indentLine(line, indentLevel)),
            ...indentChildren(content, startingInnerIndent + 1),
            ...end.map((line) => indentLine(line, indentLevel)),
          ];
        } else {
          return [
            [
              ...begin.map((line) => indentLine(line, indentLevel)),
              ...content,
              ...end,
            ].join(""),
          ];
        }
      } else {
        if (el.root === "screen" || el.root === "component") {
          // We are using a custom component
          const component = components?.[type];
          if (!component) {
            console.error("component not found:", type, el);
            return [];
          }
          const namedFills: Record<string, Node[]> = {};
          const defaultFillerChildren: Node[] = [];
          if (children) {
            for (const child of children) {
              if (child.type === "fill" && child.params?.name) {
                namedFills[child.params.name] ??= [];
                if (child.children) {
                  for (const fillChild of child.children) {
                    namedFills[child.params.name].push(fillChild);
                  }
                }
              } else {
                defaultFillerChildren.push(child);
              }
            }
          }
          const slottedChildren = [];
          let slotFound = false;
          if (component.children) {
            for (const child of component.children) {
              if (child.type === "slot") {
                slotFound = true;
                if (child.params?.name) {
                  const matchingNamedFillerChildren =
                    namedFills[child.params.name];
                  if (matchingNamedFillerChildren) {
                    for (const fillerChild of matchingNamedFillerChildren) {
                      slottedChildren.push(fillerChild);
                    }
                  }
                } else {
                  for (const fillerChild of defaultFillerChildren) {
                    slottedChildren.push(fillerChild);
                  }
                }
              } else {
                slottedChildren.push(child);
              }
            }
          }
          if (children && children.length > 0 && !slotFound) {
            for (const fillerChild of defaultFillerChildren) {
              slottedChildren.push(fillerChild);
            }
          }
          const base = component.params?.base;
          const componentInstance: Node = {
            ...component,
            type: base,
            params: { ...params, name: type },
            children: slottedChildren,
          };
          return renderElements(componentInstance, ctx);
        }

        if (el.root === "style") {
          if (styles) {
            if (type in styles) {
              const style = styles[type];
              return renderElements(style, ctx);
            } else if (type.startsWith("@")) {
              const atSelector = type.slice(1);
              const pseudo = atSelectorToPseudo(atSelector, breakpoints);
              const selector = pseudo?.startsWith("@") ? pseudo : `&${pseudo}`;
              const begin = `${selector} {`;
              const end = "}";
              const content =
                children?.flatMap((child, i) =>
                  renderElements(child, ctx, el, i)
                ) ?? [];
              return [
                indentLine(begin, indentLevel),
                ...indentChildren(content, indentLevel + 1),
                indentLine(end, indentLevel),
              ];
            } else {
              return [paramToProp(type, params?.value, cssAliases)];
            }
          }
        }

        if (el.root === "animation") {
          if (animations) {
            if (type in animations) {
              const animation = animations[type];
              return renderElements(animation, ctx);
            } else {
              return [paramToProp(type, params?.value, cssAliases)];
            }
          }
        }
      }
    }
  }

  return [];
}

function getContext(ctx: RenderContext): Record<string, any> {
  return { ...(ctx.state || EMPTY_OBJ), ...(ctx.scope || EMPTY_OBJ) };
}

function evaluate<T>(expr: string, context: Record<string, any>): T {
  try {
    const fn = new Function("context", `with(context) { return (${expr}); }`);
    return fn(context);
  } catch (e) {
    // console.warn("Failed to evaluate expression:", expr, context, e);
    return undefined as T;
  }
}

function interpolate(
  template: string,
  context: Record<string, any>,
  attrAliases?: Record<string, string>
): string {
  try {
    return template.replace(
      /\\(.|\r\n|\r|\n)|\{(\{.*?\})\}|\{[.][.][.](.*?)\}|\{(.*?)\}/g,
      (_, $1, $2, $3, $4) => {
        if ($1) {
          return $1;
        }
        if ($2) {
          return interpolate($2, context, attrAliases);
        }
        if ($3) {
          const obj = evaluate<object>($3, context);
          if (!Array.isArray(obj)) {
            console.warn("Object is not iterable:", obj);
            return "";
          }
          return obj.join(" ");
        }
        return evaluate<string>($4, context) ?? "";
      }
    );
  } catch (e) {
    console.warn("Failed to interpolate expression:", template, context, e);
    return "";
  }
}

function paramToAttr(
  key: string,
  value: unknown,
  context: Record<string, any>,
  attrAliases?: Record<string, string>
) {
  let k = attrAliases?.[key] ?? key;
  const v = value;
  if (k.startsWith("@")) {
    // TODO: jump to label then rerender
    //const attr = k.replaceAll("@", "on").replaceAll("-", "");
    return "";
  }
  if (typeof v === "boolean") {
    return v ? `${k}` : "";
  }
  if (typeof v === "number") {
    return `${k}=${v}`;
  }
  if (typeof v === "string") {
    return `${k}=${JSON.stringify(interpolate(v, context, attrAliases))}`;
  }
  if (Array.isArray(v)) {
    return `${k}="${v
      .map((x) =>
        typeof x === "string" ? interpolate(x, context, attrAliases) : x
      )
      .join(" ")}"`;
  }
  return "";
}

function paramToProp(
  key: string,
  value: unknown,
  cssAliases?: Record<string, string>
) {
  let k = cssAliases?.[key] ?? key;
  return `${k}: ${value};`;
}

function atSelectorToPseudo(
  selector: string,
  breakpoints: Record<string, number>
) {
  const [name, arg] = splitSelectorArgs(selector);
  switch (name) {
    case "": // @
      return "> *";
    case "@": // @@
      return "*";
    case "hovered":
      return ":hover";
    case "focused":
      return ":focus";
    case "pressed":
      return ":active";
    case "disabled":
      return ":disabled";
    case "enabled":
      return ":enabled";
    case "checked":
      return ":checked";
    case "unchecked":
      return ":not(:checked)";
    case "required":
      return ":required";
    case "valid":
      return ":valid";
    case "invalid":
      return ":invalid";
    case "readonly":
      return ":read-only";
    case "first":
      return ":first-child";
    case "last":
      return ":last-child";
    case "only":
      return ":only-child";
    case "odd":
      return ":nth-child(odd)";
    case "even":
      return ":nth-child(even)";
    case "empty":
      return ":nth-child(empty)";
    case "blank":
      return ":placeholder-shown";
    case "before":
      return "::before";
    case "after":
      return "::after";
    case "placeholder":
      return "::placeholder";
    case "selection":
      return "::selection";
    case "marker":
      return "::marker";
    case "backdrop":
      return "::backdrop";
    case "opened":
      return `[open]`;
    case "initial":
      return "@starting-style";
    case "language":
      return `:lang(${arg})`;
    case "direction":
      return `:dir(${arg})`;
    case "has":
      return `:has(${arg})`;
    case "screen":
      const breakpoint = (breakpoints || DEFAULT_BREAKPOINTS)[arg];
      const size = breakpoint != null ? `${breakpoint}px` : arg;
      return `@container(max-width:${size})`;
    case "theme":
      return `@media(prefers-color-scheme:${arg})`;
    default:
      return "." + selector;
  }
}

const INDENT = "  ";
function indentLine(line: string, level: number) {
  return INDENT.repeat(level) + line;
}

const indentChildren = (lines: string[], level: number) =>
  lines.map((line) =>
    line.trim() === "" ? "" : indentLine(line.trimEnd(), level)
  );

function getIndentLevel(line: string) {
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char !== " " && char !== "\t") {
      return i / INDENT.length;
    }
  }
  return 0;
}

function getInheritanceChain(
  type: string,
  builtins: Record<string, BuiltinDefinition>,
  components?: Record<string, Node>
) {
  const out: string[] = [];
  addToInheritanceChain(type, builtins, components, out);
  return out;
}

function addToInheritanceChain(
  type: string,
  builtins: Record<string, BuiltinDefinition>,
  components: Record<string, Node> | undefined,
  out: string[]
) {
  if (type in builtins) {
    out.push(type);
  }
  if (components) {
    if (type in components) {
      const component = components[type];
      out.push(component.params.name);
      addToInheritanceChain(component.params.base, builtins, components, out);
    }
  }
}

export function renderStyles(
  parsed: ParseContext,
  ctx: RenderContext,
  styleName?: string
): string {
  if (!parsed.styles) {
    return "";
  }
  if (styleName) {
    return renderElements(parsed.styles[styleName], ctx).join("\n");
  }
  return Object.values(parsed.styles)
    .map((style) => renderElements(style, ctx).join("\n"))
    .join("\n");
}

export function renderHTML(
  parsed: ParseContext,
  ctx: RenderContext,
  screenName?: string
): string {
  if (!parsed.screens) {
    return "";
  }
  if (screenName) {
    return renderElements(parsed.screens[screenName], ctx).join("\n");
  }
  return Object.values(parsed.screens)
    .map((screen) => renderElements(screen, ctx).join("\n"))
    .join("\n");
}

export function mountUI(
  elements: { htmlContainer: Element; stylesContainer: Element },
  input: string,
  state: Record<string, any>
) {
  const parsed = parseSSL(input);
  const ctx: RenderContext = {
    parsed,
    state,
    renderStyles: () => {
      elements.stylesContainer.innerHTML = renderStyles(parsed, ctx);
    },
    renderHTML: () => {
      elements.htmlContainer.innerHTML = renderHTML(parsed, ctx);
    },
  };
  ctx.renderHTML();
}
