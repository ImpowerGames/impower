import { type SparkleNode } from "../parser/parser";
import { builtins } from "./builtins";
import { sparkleSelectorToCssSelector } from "./css";
import { VElement, VNode } from "./vnode";

export interface RendererOptions {
  breakpoints?: Record<string, number>;
  attrAliases?: Record<string, string>;
  cssAliases?: Record<string, string>;
}

export const DEFAULT_ATTR_ALIASES = {
  "focus-order": "tab-index",
};

export const DEFAULT_CSS_ALIASES = {
  easing: "animation-timing-function",
  iterations: "animation-iteration-count",
  duration: "animation-duration",
  delay: "animation-delay",
};

const EMPTY_OBJ = {};

export interface RenderContext {
  parsed: SparkleNode[];
  components: Record<string, SparkleNode>;
  state: Record<string, any>;
  scope?: Record<string, any>;
  renderStyles: () => void;
  renderHTML: () => void;
  indent?: number;
  options?: RendererOptions;
}

export function renderVNode(
  el: SparkleNode,
  ctx: RenderContext,
  parent?: SparkleNode,
  index: number = 0
): VNode {
  const { type, args: params, children } = el;
  const components = ctx.components;
  const breakpoints = ctx.options?.breakpoints;
  const cssAliases = ctx.options?.cssAliases ?? DEFAULT_CSS_ALIASES;

  switch (type) {
    case "if": {
      let selectedChildren: SparkleNode[] = [];
      if (evaluate(params?.condition, getContext(ctx))) {
        selectedChildren = children ?? [];
      } else {
        let offset = 1;
        let sibling = parent?.children?.[index + offset];
        while (
          sibling &&
          (sibling.type === "elseif" || sibling.type === "else")
        ) {
          if (
            sibling.type === "elseif" &&
            evaluate(sibling.args?.condition, getContext(ctx))
          ) {
            selectedChildren = sibling.children ?? [];
            break;
          }
          if (sibling.type === "else") {
            selectedChildren = sibling.children ?? [];
            break;
          }
          offset++;
          sibling = parent?.children?.[index + offset];
        }
      }
      return wrapChildren(
        selectedChildren.map((c, i) => renderVNode(c, ctx, el, i))
      );
    }

    case "elseif":
    case "else":
    case "case":
      return { tag: "fragment", props: {}, children: [] }; // handled by parent if/match

    case "for": {
      const list = evaluate(params?.each, getContext(ctx)) || [];
      const entries = Object.entries(list);
      const nextSibling = parent?.children?.[index + 1];
      if (entries.length === 0 && nextSibling?.type === "else") {
        return wrapChildren(
          nextSibling.children?.map((c, i) =>
            renderVNode(c, ctx, nextSibling, i)
          ) ?? []
        );
      }
      const asKeys: string[] = params?.as;
      const items = entries.flatMap(([key, value]) => {
        const newScope =
          asKeys?.length > 1
            ? { [asKeys[0]]: key, [asKeys[1]]: value }
            : { [asKeys[0]]: value };
        const subCtx = {
          ...ctx,
          scope: { ...(ctx.scope ?? EMPTY_OBJ), ...newScope },
        };
        const childVNodes =
          children?.map((c, i) => renderVNode(c, subCtx, el, i)) ?? [];

        // Attach a key to the first element if missing
        for (const vnode of childVNodes) {
          if (typeof vnode !== "string" && !("key" in vnode.props)) {
            vnode.key = key; // Use entry key
          }
        }

        return childVNodes;
      });
      return wrapChildren(items);
    }

    case "repeat": {
      const times = evaluate<number>(params?.times, getContext(ctx));
      const nextSibling = parent?.children?.[index + 1];
      if (Number.isNaN(times))
        return { tag: "fragment", props: {}, children: [] };
      if (times === 0 && nextSibling?.type === "else") {
        return wrapChildren(
          nextSibling.children?.map((c, i) =>
            renderVNode(c, ctx, nextSibling, i)
          ) ?? []
        );
      }
      const repeats = Array.from({ length: times }).flatMap((_, i) => {
        const subCtx = {
          ...ctx,
          scope: { ...(ctx.scope ?? EMPTY_OBJ), index: i },
        };
        const childVNodes =
          children?.map((c, j) => renderVNode(c, subCtx, el, j)) ?? [];

        // Attach a key to the first element if missing
        for (const vnode of childVNodes) {
          if (typeof vnode !== "string" && !("key" in vnode.props)) {
            vnode.key = String(i); // Use repeat index
          }
        }

        return childVNodes;
      });
      return wrapChildren(repeats);
    }

    case "match": {
      const value = evaluate(params?.expression, getContext(ctx));
      if (children) {
        for (const child of children) {
          if (
            child.type === "case" &&
            evaluate(child.args?.value, getContext(ctx)) === value
          ) {
            return wrapChildren(
              child.children?.map((c, i) => renderVNode(c, ctx, child, i)) ?? []
            );
          } else if (child.type === "else") {
            return wrapChildren(
              child.children?.map((c, i) => renderVNode(c, ctx, child, i)) ?? []
            );
          }
        }
      }
      return { tag: "fragment", props: {}, children: [] };
    }

    case "fill":
      // Handled by "organizeFills"
      return { tag: "fragment", props: {}, children: [] };
  }

  if (el.root === "screen" || el.root === "component") {
    // Otherwise normal node
    const builtin = builtins.get(type);
    const componentDef = components?.[type];
    if (componentDef) {
      // Look up component definition
      const componentScope: Record<string, any> = { ...ctx.scope };

      // Handle component parameters by mapping provided args to formal parameters
      for (const [paramIndex, value] of Object.entries(el.args?.parameters)) {
        const param = componentDef.args?.parameters?.[paramIndex];
        // Evaluate param value if it's an expression
        if (param != null && typeof value === "string") {
          if (value.startsWith('"') && value.endsWith('"')) {
            componentScope[param] = interpolate(
              value.slice(1, -1),
              getContext(ctx)
            );
          } else {
            componentScope[param] = evaluate(value, getContext(ctx));
          }
        }
      }

      // Create new context with component scope
      const componentCtx = {
        ...ctx,
        scope: componentScope,
      };

      // Process component children and slots
      const fills = organizeFills(el.children || []);
      const implicitFills = fills[""];
      const slotsFound: SparkleNode[] = [];
      const processedChildren = instantiateSlots(
        componentDef.children || [],
        fills,
        slotsFound
      );

      if (slotsFound.length === 0 && implicitFills.length > 0) {
        // If no slots defined, append implicit fills as last children
        processedChildren.push(...implicitFills);
      }

      // Render the processed component
      return renderVNode(
        {
          ...componentDef,
          children: processedChildren,
        },
        componentCtx,
        el,
        index
      );
    } else if (builtin) {
      return renderBuiltinVNode(el, ctx, builtin.vnode);
    }
  }

  if (el.root === "style") {
    if (type === "style") {
      // Special case: build a style block
      const styleContent = (children ?? [])
        .map((c, i) => renderVNode(c, ctx, el, i))
        .join(" ");
      const name = el.args?.name;
      return {
        tag: "style",
        props: {},
        children: [`.style.${name} { ${styleContent} }`],
      };
    }
    if (type === "prop") {
      return paramToProp(params?.key, params?.value, cssAliases);
    }
    const selector = sparkleSelectorToCssSelector(type, breakpoints);
    const blockContent = (children ?? [])
      .map((c, i) => {
        return renderVNode(c, ctx, el, i) as string;
      })
      .join(" ");
    return `${selector} { ${blockContent} }`;
  }

  if (el.root === "animation") {
    if (type === "animation") {
      // Special case: build a style block
      const styleContent = (children ?? [])
        .map((c, i) => renderVNode(c, ctx, el, i))
        .join("\n");
      return {
        tag: "style",
        props: {},
        children: [styleContent],
      };
    }
    if (type === "prop") {
      return paramToProp(params?.key, params?.value, cssAliases);
    }
    if (type === "keyframes" && children?.length) {
      const max = children.length - 1;
      const styleContent = children
        .map((keyframe, i) => {
          const offset = max === 0 ? "to" : `${(i / max) * 100}%`;
          const keyframeContent = (
            keyframe.children?.map((c, j) =>
              renderVNode(c, ctx, keyframe, j)
            ) ?? []
          ).join(" ");
          return `${offset} { ${keyframeContent} }`;
        })
        .join(" ");
      const name = parent?.args?.name;
      return `@keyframes ${name} { ${styleContent} }`;
    }
    if (type === "timing" && children?.length) {
      const name = parent?.args?.name;
      const timing: {
        duration?: string;
        delay?: string;
        easing?: string;
        iterations?: string;
        direction?: string;
        fill?: string;
      } = {};
      for (const c of children) {
        const key = c.args?.key;
        const value = c.args?.value;
        if (key === "duration" || key === "animation-duration") {
          timing.duration = value;
        }
        if (key === "delay" || key === "animation-delay") {
          timing.delay = value;
        }
        if (key === "easing" || key === "animation-timing-function") {
          timing.easing = value;
        }
        if (key === "iterations" || key === "animation-iteration-count") {
          timing.iterations = value;
        }
        if (key === "direction" || key === "animation-direction") {
          timing.direction = value;
        }
        if (key === "fill" || key === "animation-fill-mode") {
          timing.fill = value;
        }
      }
      const shorthand = [
        timing.duration,
        timing.easing,
        timing.delay,
        timing.iterations,
        timing.direction,
        timing.fill,
        name,
      ]
        .filter(Boolean)
        .join(" ");
      const animationDeclaration = `---theme_animation-${name}: ${shorthand};`;
      return `:is(:root,:host) { ${animationDeclaration} }`;
    }

    return "";
  }

  if (el.root === "theme") {
    if (type === "theme") {
      // Special case: build a style block
      const styleContent = (children ?? [])
        .map((c, i) => "---theme_" + renderVNode(c, ctx, el, i))
        .join("");
      const name = el.args?.name;
      return {
        tag: "style",
        props: {},
        children: [
          `:is([theme="${name}"],.theme-${name}) > * { ${styleContent} }`,
        ],
      };
    }
    if (type === "prop") {
      return paramToProp(params?.key, params?.value, cssAliases);
    }
    const content = (children ?? [])
      .map((c, i) => renderVNode(c, ctx, el, i) as string)
      .join("");
    return `${type}-${content}`;
  }

  console.warn("Unhandled node type:", type, el);
  return { tag: "fragment", props: {}, children: [] };
}

function wrapChildren(children: VNode[]): VNode {
  return {
    tag: "fragment",
    props: {},
    children,
  };
}

function renderBuiltinVNode(
  el: SparkleNode,
  ctx: RenderContext,
  builtin: VNode
): VNode {
  const { type, args: params = {}, children } = el;
  const components = ctx.components;
  if (!builtin) {
    console.error("Un-recognised builtin:", type);
    return { tag: "fragment", props: {}, children: [] };
  }

  /*  1.  Clone the static skeleton  */
  const root = cloneVNode(builtin) as VElement;

  /*  2.  Fill dynamic attrs/classes  */
  const inherited =
    type === "component"
      ? getInheritanceChain(params?.base, components)
      : getInheritanceChain(type, components);

  const dynamicClass = [
    ...(params.classes ?? []),
    ...inherited,
    params.base,
    params.name,
  ]
    .filter(Boolean)
    .join(" ");

  if (!mergeClassesIntoHost(root, dynamicClass)) {
    // fallback: put classes on root if no {classes} placeholder
    const base = root.props.class ? root.props.class + " " : "";
    root.props.class = base + dynamicClass;
  }

  /* gather user-supplied attrs after interpolation */
  const evalCtx = getContext(ctx);
  const spreadProps: Record<string, string> = {};
  if (params.attributes) {
    for (const [k, v] of Object.entries(params.attributes).filter(
      ([k]) => !["content"].includes(k)
    )) {
      spreadProps[k] =
        typeof v === "string" ? interpolate(v, evalCtx) : String(v);
    }
  }

  /* find the attrsHost in the cloned tree */
  function mergeIntoHost(node: VNode): boolean {
    if (typeof node === "string") return false;
    if (node.attrsHost) {
      Object.assign(node.props, spreadProps);
      return true;
    }
    return node.children.some(mergeIntoHost);
  }

  if (!mergeIntoHost(root)) {
    // fallback: no flag present, merge into root
    Object.assign(root.props, spreadProps);
  }

  if (type === "screen" && params.name) root.props.id = params.name;

  /*  3.  Inject slot <content-slot> and <children-slot>  */
  const contentV: VNode =
    typeof params.attributes?.content === "string"
      ? interpolate(params.attributes?.content, evalCtx)
      : "";

  if (root.contentAttr) {
    root.props[root.contentAttr] =
      typeof params.attributes?.content === "string"
        ? interpolate(params.attributes?.content, evalCtx)
        : "";
  }

  root.children = root.children
    .flatMap((ch) => {
      if (typeof ch === "string") {
        return ch;
      }
      if (ch.tag === "content-slot") {
        return contentV;
      }
      if (ch.tag === "children-slot") {
        return children?.map((c, i) => renderVNode(c, ctx, el, i)) || [];
      }
      // recurse
      return injectSlots(ch, params.attributes?.content, children, ctx, el);
    })
    .filter(Boolean);

  return root;
}

function injectSlots(
  vnode: VElement,
  content: unknown,
  childNodes: SparkleNode[] | undefined,
  ctx: RenderContext,
  owner: SparkleNode
): VNode {
  const evalCtx = getContext(ctx);

  return {
    ...vnode,
    // deep-map children
    children: vnode.children
      .flatMap((ch) => {
        if (typeof ch === "string") {
          // "plain" text inside the builtin: run interpolation on it too
          return ch.includes("{") ? interpolate(ch, evalCtx) : ch;
        }
        if (ch.tag === "content-slot") {
          return typeof content === "string"
            ? interpolate(content, evalCtx)
            : "";
        }
        if (ch.tag === "children-slot") {
          return childNodes?.map((c, i) => renderVNode(c, ctx, owner, i)) || [];
        }
        // recurse
        return injectSlots(ch, content, childNodes, ctx, owner);
      })
      .filter(Boolean),
  };
}

function cloneVNode(v: VNode): VNode {
  if (typeof v === "string") return v;

  return {
    tag: v.tag,
    props: { ...v.props },
    children: v.children.map(cloneVNode),
    key: v.key,
    contentAttr: v.contentAttr,
    attrsHost: v.attrsHost,
    classHost: v.classHost,

    /* keep fast-path data */
    builtin: v.builtin,
    template: v.template,
  };
}

function organizeFills(children: SparkleNode[]): Record<string, SparkleNode[]> {
  const fills: Record<string, SparkleNode[]> = {};
  const otherChildren = [];
  for (const child of children) {
    if (child.type === "fill") {
      const name = child.args?.name ?? "";
      fills[name] ??= [];
      fills[name].push(...(child.children ?? []));
    } else {
      otherChildren.push(child);
    }
  }
  // fills for unnamed slots
  fills[""] ??= [];
  fills[""].push(...otherChildren);
  return fills;
}

function instantiateSlots(
  componentChildren: SparkleNode[],
  fills: Record<string, SparkleNode[]>,
  slotsFound: SparkleNode[]
): SparkleNode[] {
  const output: SparkleNode[] = [];

  for (const child of componentChildren) {
    if (child.type === "slot") {
      // if this is a slot, splice in its fills (or nothing)
      const name = child.args?.name ?? "";
      if (fills[name]) {
        output.push(...fills[name]);
      }
      slotsFound.push(child);
    } else {
      // otherwise, clone the node…
      const copy: SparkleNode = { ...child, args: { ...(child.args || {}) } };

      // …and if it has its own children, recurse
      if (Array.isArray(child.children)) {
        copy.children = instantiateSlots(child.children, fills, slotsFound);
      }

      output.push(copy);
    }
  }

  return output;
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

function paramToProp(
  key: string,
  value: unknown,
  cssAliases?: Record<string, string>
) {
  let k = cssAliases?.[key] ?? key;
  return `${k}: ${value};`;
}

function getInheritanceChain(
  type: string,
  components?: Record<string, SparkleNode>
) {
  const out: string[] = [];
  addToInheritanceChain(type, components, out);
  return out;
}

function addToInheritanceChain(
  type: string,
  components: Record<string, SparkleNode> | undefined,
  out: string[]
) {
  out.push(type);
  if (components) {
    if (type in components) {
      const component = components[type];
      out.push(component.args?.name);
      addToInheritanceChain(component.args?.base, components, out);
    }
  }
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

export function renderCssVDOM(
  parsed: SparkleNode[],
  ctx: RenderContext
): VNode {
  const children: VNode[] = [];
  for (const root of parsed) {
    if (
      root.type === "animation" ||
      root.type === "style" ||
      root.type === "theme"
    ) {
      children.push(renderVNode(root, ctx));
    }
  }
  return wrapChildren(children);
}

export function renderHtmlVDOM(
  parsed: SparkleNode[],
  ctx: RenderContext
): VNode {
  const children: VNode[] = [];
  for (const root of parsed) {
    if (root.type === "screen") {
      children.push(renderVNode(root, ctx));
    }
  }
  return wrapChildren(children);
}

function mergeClassesIntoHost(node: VNode, dyn: string): boolean {
  if (typeof node === "string") return false;
  if (node.classHost) {
    const base = node.props.class ? node.props.class + " " : "";
    node.props.class = base + dyn;
    return true;
  }
  return node.children.some((c) => mergeClassesIntoHost(c, dyn));
}
