import { Node, ParseContext, parseSSL } from "./parser";

export interface BuiltinDefinition {
  begin: string;
  end: string;
}

export interface RendererOptions {
  builtins?: Record<string, BuiltinDefinition>;
  breakpoints?: Record<string, number>;
  attrAliases?: Record<string, string>;
  cssAliases?: Record<string, string>;
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
    begin: '<div class="style {classes}" {...attrs}>{{content}}',
    end: "</div>",
  },
  component: {
    begin: '<div class="style {classes}" {...attrs}>{{content}}',
    end: "</div>",
  },
  "": {
    begin: '<div class="style {classes}" {...attrs}>{{content}}',
    end: "</div>",
  },
  Box: {
    begin: '<div class="style {classes}" {...attrs}>{{content}}',
    end: "</div>",
  },
  Row: {
    begin: '<div class="style {classes}" {...attrs}>{{content}}',
    end: "</div>",
  },
  Column: {
    begin: '<div class="style {classes}" {...attrs}>{{content}}',
    end: "</div>",
  },
  Grid: {
    begin: '<div class="style {classes}" {...attrs}>{{content}}',
    end: "</div>",
  },
  Text: {
    begin: '<div class="style {classes}" {...attrs}>{{content}}',
    end: "</div>",
  },
  Button: {
    begin: '<button class="style {classes}" {...attrs}>{{content}}',
    end: "</button>",
  },
  Image: {
    begin: '<img class="style {classes}" alt="{{content}}" {...attrs}/>',
    end: "",
  },
  Input: {
    begin: `
<label class="style InputGroup">
  <span class="style Label">{{content}}
`,
    end: `
  </span>
  <input class="style {classes}" type="text" {...attrs}/>
</label>
`,
  },
  InputArea: {
    begin: `
<label class="style InputGroup">
  <span class="style Label">{{content}}
`,
    end: `
  </span>
  <textarea class="style {classes}" {...attrs}/>
</label>
`,
  },
  Slider: {
    begin: `
<label class="style InputGroup">
  <span class="style Label">{{content}}
`,
    end: `
  </span>
  <input class="style {classes}" type="range" style="---fill-percentage: 50%;" oninput="this.style.setProperty('---fill-percentage', (this.value - this.min) / (this.max - this.min) * 100 + '%')" {...attrs}/>
</label>
`,
  },
  Checkbox: {
    begin: `
<label class="style InputGroup">
  <input class="style {classes}" type="checkbox" {...attrs}/>
  <span class="style Label">{{content}}
`,
    end: `
  </span>
</label>
`,
  },
  Dropdown: {
    begin: `
<label class="style InputGroup">
  <span class="style Label">{{content}}</span>
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
    begin: '<option class="style {classes}" {...attrs}>{{content}}',
    end: "</option>",
  },
  Space: {
    begin: '<div class="style {classes}" {...attrs}>{{content}}',
    end: "</div>",
  },
  Divider: {
    begin: "<hr>",
    end: "",
  },
} as const;

export const DEFAULT_ATTR_ALIASES = {
  "focus-order": "tab-index",
};

export const DEFAULT_CSS_ALIASES = {
  easing: "animation-timing-function",
  iterations: "animation-iteration-count",
  duration: "animation-duration",
  delay: "animation-delay",
};

export const DEFAULT_BREAKPOINTS = {
  xs: 400,
  sm: 600,
  md: 960,
  lg: 1280,
  xl: 1920,
};

const EMPTY_OBJ = {};

export interface RenderContext {
  parsed: ParseContext;
  state: Record<string, any>;
  scope?: Record<string, any>;
  renderStyles: () => void;
  renderHTML: () => void;
  indent?: number;
  options?: RendererOptions;
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
  const builtins = ctx.options?.builtins ?? DEFAULT_BUILTINS;
  const breakpoints = ctx.options?.breakpoints ?? DEFAULT_BREAKPOINTS;
  const attrAliases = ctx.options?.attrAliases ?? DEFAULT_ATTR_ALIASES;
  const cssAliases = ctx.options?.cssAliases ?? DEFAULT_CSS_ALIASES;

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
          elementContext["name"] = el.params?.name;
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
          component.begin.trimEnd(),
          elementContext,
          attrAliases
        );
        const endTemplate = interpolate(
          trimLeadingNewlines(component.end),
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
        if (content.length <= 1) {
          // If there is one or no content elements, render it on a single line
          //
          // This:
          //   <tag>{{content}}</tag>
          //
          // Instead of:
          //   <tag>
          //     {{content}}
          //   </tag>
          const firstEnd = end.shift();
          if (firstEnd != null) {
            if (content[content.length - 1] != null) {
              content[content.length - 1] += firstEnd.trimStart();
            } else if (begin[begin.length - 1] != null) {
              begin[begin.length - 1] += firstEnd.trimStart();
            }
          }
        }
        const isMultiline = begin.length > 1 || content.length > 1;
        if (isMultiline || el.root === "style" || el.root === "animation") {
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
          if (type.startsWith("@")) {
            const pseudo = atSelectorToPseudo(type, breakpoints);
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
          } else if (type === "prop") {
            return [paramToProp(params?.key, params?.value, cssAliases)];
          }
        }

        if (el.root === "animation") {
          if (type === "keyframes") {
            if (el.children && el.children.length > 0) {
              const max = el.children.length - 1;
              return el.children.flatMap((keyframe, i) => {
                const offset = max === 0 ? "to" : `${(i / max) * 100}%`;
                const begin = `${offset} {`;
                const end = "}";
                const content =
                  keyframe.children?.flatMap((child, i) =>
                    renderElements(child, ctx, el, i)
                  ) ?? [];
                return [
                  indentLine(begin, indentLevel),
                  ...indentChildren(content, indentLevel + 1),
                  indentLine(end, indentLevel),
                ];
              });
            }
          } else if (type === "item") {
            // handled by keyframes
          } else if (type === "timing") {
            // ignored by renderer
          } else if (type === "prop") {
            return [paramToProp(params?.key, params?.value, cssAliases)];
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

const PSEUDO_ALIASES = {
  "@hovered": ":hover",
  "@focused": ":focus",
  "@pressed": ":active",
  "@disabled": ":disabled",
  "@enabled": ":enabled",
  "@checked": ":checked",
  "@unchecked": ":not(:checked)",
  "@required": ":required",
  "@valid": ":valid",
  "@invalid": ":invalid",
  "@readonly": ":read-only",
  "@first": ":first-child",
  "@last": ":last-child",
  "@only": ":only-child",
  "@odd": ":nth-child(odd)",
  "@even": ":nth-child(even)",
  "@empty": ":nth-child(empty)",
  "@blank": ":placeholder-shown",
  "@direction(": ":dir(",
  "@language(": ":lang(",
  "@theme(": "@media(prefers-color-scheme:",
  "@container-size(": "@container(max-width:",
  "@screen-size(": "@container screen (max-width:",
  "@before": "::before",
  "@after": "::after",
  "@placeholder": "::placeholder",
  "@selection": "::selection",
  "@marker": "::marker",
  "@backdrop": "::backdrop",
  "@opened": "[open]",
  "@initial": "@starting-style",
};

function atSelectorToPseudo(
  selector: string,
  breakpoints: Record<string, number>
) {
  // Handles universal selectors
  selector = selector.replace(/@@(?![a-zA-Z])/g, "*");
  selector = selector.replace(/@(?![a-zA-Z])/g, "> *");

  // Handles named breakpoints (xl, lg, md, sm, xs)
  for (const [k, v] of Object.entries(breakpoints || DEFAULT_BREAKPOINTS)) {
    selector = selector.replace(
      new RegExp(`@screen-size[(]\s*${k}\s*[)]`, "g"),
      `@container screen (max-width:${v})`
    );
  }

  // Handles shorthand aliases
  for (const [shorthand, expanded] of Object.entries(PSEUDO_ALIASES)) {
    selector = selector.replaceAll(shorthand, expanded);
  }

  // Handles remaining pseudo functions
  selector = selector.replaceAll("@", ":");

  return selector;
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

export function trimLeadingNewlines(input: string): string {
  return input.replace(/^[\r\n]+/, "");
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
      out.push(component.params?.name);
      addToInheritanceChain(component.params?.base, builtins, components, out);
    }
  }
}

export function renderStyles(parsed: ParseContext, ctx: RenderContext): string {
  let css = "";
  if (parsed.animations) {
    css +=
      "\n" +
      Object.values(parsed.animations)
        .map((style) => renderElements(style, ctx).join("\n"))
        .join("\n");
  }
  if (parsed.styles) {
    css +=
      "\n" +
      Object.values(parsed.styles)
        .map((style) => renderElements(style, ctx).join("\n"))
        .join("\n");
  }
  return css.trim();
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
