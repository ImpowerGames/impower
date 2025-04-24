export interface Node {
  root: "screen" | "component" | "style" | "animation";
  type: string;
  params: Record<string, any>;
  children: Node[];
}

export interface BuiltinDefinition {
  begin: string;
  end: string;
}

export interface ParseOptions {
  builtins?: Record<string, BuiltinDefinition>;
  breakpoints?: Record<string, number>;
  attrAliases?: Record<string, string>;
}

export interface ParseContext extends ParseOptions {
  screens?: Record<string, Node>;
  components?: Record<string, Node>;
  styles?: Record<string, Node>;
}

export const DEFAULT_BUILTINS: Record<string, BuiltinDefinition> = {
  style: {
    begin: "<style> :host .{type}.{name} \\{ ",
    end: "} </style>",
  },
  screen: {
    begin: '<div class="style {type} {name}" {...attrs}>',
    end: "</div>",
  },
  component: {
    begin: '<div class="style {type} {name}" {...attrs}>',
    end: "</div>",
  },
  Box: {
    begin: '<div class="style {type} {name}" {...attrs}>',
    end: "</div>",
  },
  Row: {
    begin: '<div class="style {type} {name}" {...attrs}>',
    end: "</div>",
  },
  Column: {
    begin: '<div class="style {type} {name}" {...attrs}>',
    end: "</div>",
  },
  Grid: {
    begin: '<div class="style {type} {name}" {...attrs}>',
    end: "</div>",
  },
  Label: {
    begin: '<div class="style {type} {name}" {...attrs}>{{label}}',
    end: "</div>",
  },
  Button: {
    begin: '<button class="style {type} {name}" {...attrs}>{{label}}',
    end: "</button>",
  },
  Image: {
    begin: '<img class="style {type} {name}" {...attrs}>',
    end: "</img>",
  },
  Input: {
    begin:
      '<label class="style InputGroup"><span class="style Label">{{label}}</span><input class="style {type} {name}" type="text" {...attrs}>',
    end: "</input></label>",
  },
  Slider: {
    begin: `<label class="style InputGroup"><span class="style Label">{{label}}</span><input class="style {type} {name}" type="range" style="--fill-percentage: 50%;" oninput="this.style.setProperty('--fill-percentage', (this.value - this.min) / (this.max - this.min) * 100 + '%')" {...attrs}>`,
    end: "</input></label>",
  },
  Checkbox: {
    begin:
      '<label class="style InputGroup"><input class="style {type} {name}" type="checkbox" {...attrs}><span class="style Label">{{label}}</span>',
    end: "</input></label>",
  },
  Dropdown: {
    begin:
      '<label class="style InputGroup"><span class="style Label">{{label}}</span><div class="style DropdownArrow"><select class="style {type} {name}" {...attrs}>',
    end: "</select></div></label>",
  },
  Option: {
    begin: '<option class="style {type} {name}" {...attrs}>',
    end: "</option>",
  },
  Space: {
    begin: '<div class="style {type} {name}" {...attrs}>',
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

const DEFAULT_BREAKPOINTS = {
  xs: 400,
  sm: 600,
  md: 960,
  lg: 1280,
  xl: 1920,
};

const INDENT_REGEX: RegExp = /^[ \t]*/;

const EMPTY_OBJ = {};

export function parseSSL(input: string, options?: ParseOptions): ParseContext {
  const builtins = options?.builtins ?? DEFAULT_BUILTINS;
  const breakpoints = options?.breakpoints ?? DEFAULT_BREAKPOINTS;
  const attrAliases = options?.attrAliases ?? DEFAULT_ATTR_ALIASES;

  const rawLines = input.split(/\r\n|\r|\n/);

  const screens: Record<string, Node> = {};
  const components: Record<string, Node> = {};
  const styles: Record<string, Node> = {};
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
        const base = key ? keyOrBase : "screen";
        const name = key ? key : keyOrBase;
        currentRoot = {
          root: "screen",
          type: "screen",
          params: { base, name },
          children: [],
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
        const base = key ? keyOrBase : "component";
        const name = key ? key : keyOrBase;
        currentRoot = {
          root: "component",
          type: "component",
          params: { base, name },
          children: [],
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
        const base = key ? keyOrBase : "style";
        const name = key ? key : keyOrBase;
        currentRoot = {
          root: "style",
          type: "style",
          params: { base, name },
          children: [],
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
        const base = key ? keyOrBase : "Animation";
        const name = key ? key : keyOrBase;
        currentRoot = {
          root: "animation",
          type: "animation",
          params: { base, name },
          children: [],
        };
        components[name] = currentRoot;
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
              children: [],
            };
          } else if (nodeType === "elseif") {
            const condition = args.join(" ").trim();
            node = {
              root: currentRoot.root,
              type: nodeType,
              params: { condition },
              children: [],
            };
          } else if (nodeType === "else") {
            node = {
              root: currentRoot.root,
              type: nodeType,
              params: {},
              children: [],
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
              children: [],
            };
          } else if (nodeType === "repeat") {
            const times = args.join(" ").trim();
            node = {
              root: currentRoot.root,
              type: nodeType,
              params: { times },
              children: [],
            };
          } else if (nodeType in builtins) {
            const params = parseParams(args);
            node = {
              root: currentRoot.root,
              type: nodeType,
              params,
              children: [],
            };
          } else if (nodeType) {
            const name = nodeType;
            node = {
              root: currentRoot.root,
              type: "use",
              params: { name },
              children: [],
            };
          }
        } else if (currentRoot?.type === "style") {
          // Determine child node type
          if (SELECTOR_SIMPLE_CONDITION_NAMES.includes(nodeType)) {
            node = {
              root: currentRoot.root,
              type: nodeType,
              params: {},
              children: [],
            };
          } else if (SELECTOR_FUNCTION_CONDITION_NAMES.includes(nodeType)) {
            node = {
              root: currentRoot.root,
              type: nodeType,
              params: { args },
              children: [],
            };
          } else {
            const value = args.join(" ").split("=")[1]?.trimStart();
            node = {
              root: currentRoot.root,
              type: nodeType,
              params: { value },
              children: [],
            };
          }
        }

        // Add node to parent's children and to the stack
        if (node) {
          parent.children.push(node);
          stack.push({ node: node, indent });
        }
      }
    }
  }

  return { screens, components, styles, builtins, breakpoints, attrAliases };
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
      (match = arg.match(/^(@?\w+)=\"(.*?)\"$/)) ||
      (match = arg.match(/^(@?\w+)=(\S+)$/))
    ) {
      const [, key, value] = match;
      params[key!] = parseValue(value);
    } else if ((match = arg.match(/^(\w+)$/))) {
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
}

export interface Node {
  type: string;
  params: Record<string, any>;
  children: Node[];
}

export function renderElement(
  el: Node,
  ctx: RenderContext,
  parent?: Node,
  index: number = 0
): string {
  const { type, params, children } = el;

  const components = ctx.parsed.components;
  const screens = ctx.parsed.screens;
  const styles = ctx.parsed.styles;
  const builtins = ctx.parsed.builtins ?? DEFAULT_BUILTINS;
  const breakpoints = ctx.parsed.breakpoints ?? DEFAULT_BREAKPOINTS;
  const attrAliases = ctx.parsed.attrAliases ?? DEFAULT_ATTR_ALIASES;

  if (type === "use") {
    const component = components?.[params.name];
    if (!component) {
      console.error("component not found:", params.name, el);
      return "";
    }
    const base = component.params.base;
    if (base) {
      return renderElement({ ...component, type: base }, ctx);
    }
    return renderElement(component, ctx);
  }

  if (type in builtins) {
    const evalContext = getContext(ctx);
    const component = builtins[type as keyof typeof builtins];
    const interpContext: Record<string, any> = { ...el.params, type };
    if (el.root === "style" || el.root === "animation") {
      interpContext["props"] = params;
    } else {
      interpContext["attrs"] = params;
    }
    const begin = interpolate(
      component.begin,
      interpContext,
      evalContext,
      attrAliases
    );
    const end = interpolate(
      component.end,
      interpContext,
      evalContext,
      attrAliases
    );
    const content = children
      .map((child, i) => renderElement(child, ctx, el, i))
      .join("\n");
    return `${begin}${content}${end}`;
  }

  if (el.root === "screen" || el.root === "component") {
    if (components) {
      if (type in components) {
        const component = components[type];
        return renderElement(component, ctx);
      }
    }
  }

  if (el.root === "screen" || el.root === "component") {
    if (screens) {
      if (type in screens) {
        const screen = screens[type];
        return renderElement(screen, ctx);
      }
    }
  }

  if (el.root === "style") {
    if (styles) {
      if (type in styles) {
        const style = styles[type];
        return renderElement(style, ctx);
      } else if (type.startsWith("@")) {
        const atSelector = type.slice(1);
        const pseudo = atSelectorToPseudo(atSelector, breakpoints);
        const selector = pseudo?.startsWith("@") ? pseudo : `&${pseudo}`;
        return `${selector} { ${children
          .map((child, i) => renderElement(child, ctx, el, i))
          .join("")} }`;
      } else {
        return paramToProp(type, params.value);
      }
    }
  }

  if (type === "if") {
    if (evaluate(el.params.condition, getContext(ctx))) {
      return el.children
        .map((child, i) => renderElement(child, ctx, el, i))
        .join("\n");
    }
    let siblingOffset = 1;
    let sibling = parent?.children[index + siblingOffset];
    while (sibling && (sibling.type === "elseif" || sibling.type === "else")) {
      if (
        sibling.type === "elseif" &&
        evaluate(sibling.params.condition, getContext(ctx))
      ) {
        return sibling.children
          .map((child, i) => renderElement(child, ctx, sibling, i))
          .join("\n");
      } else if (sibling.type === "else") {
        return sibling.children
          .map((child, i) => renderElement(child, ctx, sibling, i))
          .join("\n");
      }
      siblingOffset++;
      sibling = parent?.children[index + siblingOffset];
    }
    return "";
  }

  if (type === "elseif") {
    return "";
  }

  if (type === "else") {
    return "";
  }

  if (type === "for") {
    const list = evaluate(params.each, getContext(ctx)) || [];
    const entries = Object.entries(list);

    const nextSibling = parent?.children[index + 1];
    const loopChildren = children;

    if (entries.length === 0 && nextSibling?.type === "else") {
      return nextSibling.children
        .map((c, i) => renderElement(c, ctx, nextSibling, i))
        .join("\n");
    }

    const asKeys = params.as.split(",").map((k: string) => k.trim());

    return entries
      .map(([key, value]) => {
        let scopeVars: Record<string, any> = {};
        if (asKeys.length > 0) {
          scopeVars = {
            ...(asKeys[0] && { [asKeys[0]]: key }),
            ...(asKeys[1] && { [asKeys[1]]: value }),
          };
        } else {
          scopeVars = { [params.as]: value };
        }
        const subCtx = {
          ...ctx,
          scope: { ...ctx.scope, ...scopeVars },
        };
        return loopChildren
          .map((child, i) => renderElement(child, subCtx, el, i))
          .join("\n");
      })
      .join("\n");
  }

  if (type === "repeat") {
    const times = evaluate<number>(params.times, getContext(ctx));

    const nextSibling = parent?.children[index + 1];
    const loopChildren = children;

    if (Number.isNaN(times)) {
      return "";
    }

    if (times === 0 && nextSibling?.type === "else") {
      return nextSibling.children
        .map((c, i) => renderElement(c, ctx, nextSibling, i))
        .join("\n");
    }

    return Array.from({ length: times }, (_, i) => {
      const subCtx = {
        ...ctx,
        scope: { ...(ctx.scope || EMPTY_OBJ), index: i },
      };
      return loopChildren
        .map((child, j) => renderElement(child, subCtx, el, j))
        .join("\n");
    }).join("\n");
  }

  return "";
}

function getContext(ctx: RenderContext): Record<string, any> {
  return { ...(ctx.state || EMPTY_OBJ), ...(ctx.scope || EMPTY_OBJ) };
}

function evaluate<T>(expr: string, context: Record<string, any>): T {
  try {
    const fn = new Function("context", `with(context) { return (${expr}); }`);
    return fn(context);
  } catch (e) {
    // console.warn("Failed to evaluate expression:", expr, e);
    return undefined as T;
  }
}

function interpolate(
  template: string,
  context: Record<string, any>,
  evalContext?: Record<string, any>,
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
          return interpolate(
            interpolate($2, context, undefined, attrAliases),
            evalContext || context,
            undefined,
            attrAliases
          );
        }
        if ($3) {
          const obj = evaluate<object>($3, context);
          if (typeof obj !== "object") {
            return "";
          }
          const attrs = Object.entries(obj)
            .map(([k, v]) =>
              "attrs" in context
                ? paramToAttr(k, v, context, evalContext, attrAliases)
                : paramToProp(k, v)
            )
            .join(" ");
          return attrs;
        }
        return evaluate<string>($4, context) ?? "";
      }
    );
  } catch (e) {
    // console.warn("Failed to interpolate expression:", template, e);
    return "";
  }
}

function paramToAttr(
  key: string,
  value: unknown,
  context: Record<string, any>,
  evalContext?: Record<string, any>,
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
    return `${k}=${JSON.stringify(
      interpolate(v, context, evalContext, attrAliases)
    )}`;
  }
  if (Array.isArray(v)) {
    return `${k}="${v
      .map((x) =>
        typeof x === "string"
          ? interpolate(x, context, evalContext, attrAliases)
          : x
      )
      .join(" ")}"`;
  }
  return "";
}

function paramToProp(key: string, value: unknown) {
  return `${key}: ${value};`;
}

function atSelectorToPseudo(
  selector: string,
  breakpoints: Record<string, number>
) {
  const [name, arg] = splitSelectorArgs(selector);
  switch (name) {
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
      return selector;
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
  return styleName
    ? renderElement(parsed.styles[styleName], ctx)
    : Object.values(parsed.styles)
        .map((screen) => renderElement(screen, ctx))
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
  return screenName
    ? renderElement(parsed.screens[screenName], ctx)
    : Object.values(parsed.screens)
        .map((screen) => renderElement(screen, ctx))
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
