import { getCssEquivalent } from "../../../sparkle-style-transformer/src/utils/getCssEquivalent";
import { type SparkleNode } from "../parser/parser";
import { builtins } from "./builtins";
import { DEFAULT_BREAKPOINTS, sparkleSelectorToCssSelector } from "./css";
import { VElement, VNode } from "./vnode";

export interface RendererOptions {
  breakpoints?: Record<string, number>;
  attrAliases?: Record<string, string>;
  cssAliases?: Record<string, string>;
  interpolate?: (template: string, context: Record<string, any>) => string;
  evaluate?: (expr: string, context: Record<string, any>) => unknown;
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
  components: Record<string, SparkleNode>;
  state: Record<string, any>;
  scope?: Record<string, any>;
  options?: RendererOptions;
}

export function renderCssVDOM(
  parsed: SparkleNode[],
  ctx: RenderContext,
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
  ctx: RenderContext,
): VNode {
  const children: VNode[] = [];
  for (const root of parsed) {
    if (root.type === "screen") {
      children.push(renderVNode(root, ctx));
    }
  }
  return wrapChildren(children);
}

export function renderVNode(
  el: SparkleNode,
  ctx: RenderContext,
  parent?: SparkleNode,
  index: number = 0,
): VNode {
  const { type, args, children } = el;
  const components = ctx.components;
  const breakpoints = ctx.options?.breakpoints ?? DEFAULT_BREAKPOINTS;
  const cssAliases = ctx.options?.cssAliases ?? DEFAULT_CSS_ALIASES;
  const evaluate = ctx.options?.evaluate ?? defaultEvaluate;
  const interpolate = ctx.options?.interpolate ?? defaultInterpolate;

  switch (type) {
    case "if": {
      let selectedChildren: SparkleNode[] = [];
      if (evaluate(args?.["condition"], getContext(ctx))) {
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
            evaluate(sibling.args?.["condition"], getContext(ctx))
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
        selectedChildren.map((c, i) => renderVNode(c, ctx, el, i)),
      );
    }

    case "elseif":
    case "else":
    case "case":
      return { tag: "fragment", props: {}, children: [] };

    case "for": {
      const list = evaluate(args?.["each"], getContext(ctx)) || [];
      const entries = Object.entries(list);
      const nextSibling = parent?.children?.[index + 1];
      if (entries.length === 0 && nextSibling?.type === "else") {
        return wrapChildren(
          nextSibling.children?.map((c, i) =>
            renderVNode(c, ctx, nextSibling, i),
          ) ?? [],
        );
      }
      const asKeys: string[] = args?.["as"];
      const items = entries.flatMap(([key, value]) => {
        const newScope =
          asKeys?.length > 1
            ? { [asKeys[0]!]: key, [asKeys[1]!]: value }
            : { [asKeys[0]!]: value };
        const subCtx = {
          ...ctx,
          scope: { ...(ctx.scope ?? EMPTY_OBJ), ...newScope },
        };
        const childVNodes =
          children?.map((c, i) => renderVNode(c, subCtx, el, i)) ?? [];

        for (const vnode of childVNodes) {
          if (typeof vnode !== "string" && !("key" in vnode.props)) {
            vnode.key = key;
          }
        }

        return childVNodes;
      });
      return wrapChildren(items);
    }

    case "repeat": {
      const times = evaluate(args?.["times"], getContext(ctx)) as number;
      const nextSibling = parent?.children?.[index + 1];
      if (Number.isNaN(times))
        return { tag: "fragment", props: {}, children: [] };
      if (times === 0 && nextSibling?.type === "else") {
        return wrapChildren(
          nextSibling.children?.map((c, i) =>
            renderVNode(c, ctx, nextSibling, i),
          ) ?? [],
        );
      }
      const repeats = Array.from({ length: times }).flatMap((_, i) => {
        const subCtx = {
          ...ctx,
          scope: { ...(ctx.scope ?? EMPTY_OBJ), index: i },
        };
        const childVNodes =
          children?.map((c, j) => renderVNode(c, subCtx, el, j)) ?? [];

        for (const vnode of childVNodes) {
          if (typeof vnode !== "string" && !("key" in vnode.props)) {
            vnode.key = String(i);
          }
        }

        return childVNodes;
      });
      return wrapChildren(repeats);
    }

    case "match": {
      const value = evaluate(args?.["expression"], getContext(ctx));
      if (children) {
        for (const child of children) {
          if (
            child.type === "case" &&
            evaluate(child.args?.["value"], getContext(ctx)) === value
          ) {
            return wrapChildren(
              child.children?.map((c, i) => renderVNode(c, ctx, child, i)) ??
                [],
            );
          } else if (child.type === "else") {
            return wrapChildren(
              child.children?.map((c, i) => renderVNode(c, ctx, child, i)) ??
                [],
            );
          }
        }
      }
      return { tag: "fragment", props: {}, children: [] };
    }

    case "fill":
      return { tag: "fragment", props: {}, children: [] };
  }

  if (el.root === "screen" || el.root === "component") {
    const builtin = builtins.get(type);
    const componentDef = components?.[type];
    if (componentDef) {
      const componentScope: Record<string, any> = { ...ctx.scope };

      for (const [paramIndex, value] of Object.entries(el.args?.["parameters"])) {
        const param = componentDef.args?.["parameters"]?.[paramIndex];
        if (param != null && typeof value === "string") {
          if (value.startsWith('"') && value.endsWith('"')) {
            componentScope[param] = interpolate(
              value.slice(1, -1),
              getContext(ctx),
            );
          } else {
            componentScope[param] = evaluate(value, getContext(ctx));
          }
        }
      }

      const componentCtx = {
        ...ctx,
        scope: componentScope,
      };

      const fills = organizeFills(el.children || []);
      const implicitFills = fills[""];
      const slotsFound: SparkleNode[] = [];
      const processedChildren = instantiateSlots(
        componentDef.children || [],
        fills,
        slotsFound,
      );

      if (slotsFound.length === 0 && implicitFills!.length > 0) {
        processedChildren.push(...implicitFills!);
      }

      return renderVNode(
        {
          ...componentDef,
          children: processedChildren,
        },
        componentCtx,
        el,
        index,
      );
    } else if (builtin) {
      return renderBuiltinVNode(el, ctx, builtin.vnode);
    } else {
      return renderBuiltinVNode(el, ctx, builtins.get("")!.vnode);
    }
  }

  if (el.root === "style") {
    if (type === "style") {
      const styleContent = (children ?? [])
        .map((c, i) => renderVNode(c, ctx, el, i))
        .join(" ");
      const name = el.args?.["name"];
      return {
        tag: "style",
        props: {},
        children: [`.style.${name} { ${styleContent} }`],
      };
    }
    if (type === "property" && args?.["key"]) {
      return sparklePropertyToCssProperty(args?.["key"], args?.["value"], cssAliases);
    }
    const selector = sparkleSelectorToCssSelector(type, breakpoints);
    const selfTargetedSelector =
      selector.startsWith("[") || selector.startsWith(":")
        ? "&" + selector
        : selector;
    const blockContent = (children ?? [])
      .map((c, i) => {
        return renderVNode(c, ctx, el, i) as string;
      })
      .join(" ");
    return `${selfTargetedSelector} { ${blockContent} }`;
  }

  if (el.root === "animation") {
    if (type === "animation") {
      const styleContent = (children ?? [])
        .map((c, i) => renderVNode(c, ctx, el, i))
        .join("\n");
      return {
        tag: "style",
        props: {},
        children: [styleContent],
      };
    }
    if (type === "property" && args?.["key"]) {
      return sparklePropertyToCssProperty(args?.["key"], args?.["value"], cssAliases);
    }
    if (type === "keyframes" && children?.length) {
      const max = children.length - 1;
      const styleContent = children
        .map((keyframe, i) => {
          const offset = max === 0 ? "to" : `${(i / max) * 100}%`;
          const keyframeContent = (
            keyframe.children?.map((c, j) =>
              renderVNode(c, ctx, keyframe, j),
            ) ?? []
          ).join(" ");
          return `${offset} { ${keyframeContent} }`;
        })
        .join(" ");
      const name = parent?.args?.["name"];
      return `@keyframes ${name} { ${styleContent} }`;
    }
    if (type === "timing" && children?.length) {
      const name = parent?.args?.["name"];
      const timing: {
        duration?: string;
        delay?: string;
        easing?: string;
        iterations?: string;
        direction?: string;
        fill?: string;
      } = {};
      for (const c of children) {
        const key = c.args?.["key"];
        const value = c.args?.["value"];
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
      const animationDeclaration = `--theme-animation-${name}: ${shorthand};`;
      return `:is(:root,:host) { ${animationDeclaration} }`;
    }

    return "";
  }

  if (el.root === "theme") {
    if (type === "theme") {
      const styleContent = (children ?? [])
        .map((c, i) => "--theme-" + renderVNode(c, ctx, el, i))
        .join("");
      const name = el.args?.["name"];
      return {
        tag: "style",
        props: {},
        children: [
          `:is([theme="${name}"],.theme-${name}) > * { ${styleContent} }`,
        ],
      };
    }
    if (type === "property" && args?.["key"]) {
      return sparklePropertyToCssProperty(args?.["key"], args?.["value"], cssAliases);
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
  builtin: VNode,
): VNode {
  const { type, args = {}, children } = el;

  const components = ctx.components;
  const interpolate = ctx.options?.interpolate ?? defaultInterpolate;

  if (!builtin) {
    console.error("Un-recognised builtin:", type);
    return { tag: "fragment", props: {}, children: [] };
  }

  const root = cloneVNode(builtin) as VElement;

  const inherited =
    type === "component"
      ? getInheritanceChain(args?.["base"], components)
      : getInheritanceChain(type, components);

  const dynamicClass = [
    ...(args["classes"] ?? []),
    ...inherited,
    args["base"],
    args["name"],
  ]
    .filter(Boolean)
    .join(" ");

  if (!mergeClassesIntoHost(root, dynamicClass)) {
    const base = root.props["class"] ? root.props["class"] + " " : "";
    root.props["class"] = base + dynamicClass;
  }

  const evalCtx = getContext(ctx);
  const spreadProps: Record<string, string> = {};
  if (args["attributes"]) {
    for (const [k, v] of Object.entries(args["attributes"])) {
      if (k !== "content") {
        spreadProps[k] =
          typeof v === "string" ? interpolate(v, evalCtx) : String(v);
      }
    }

    const styleEntries: [string, string][] = [];
    for (const [k, v] of Object.entries(spreadProps)) {
      styleEntries.push(...getCssEquivalent(k, v, false));
    }

    if (!Number.isNaN(Number(spreadProps["value"]))) {
      const min = Number(spreadProps["min"] ?? 0);
      const max = Number(spreadProps["max"] ?? 100);
      const value = Number(spreadProps["value"] ?? min);
      const percentage =
        max === min
          ? 0
          : ((value - min) / (max - min)) * 100;
      styleEntries.push(["--_fill-percentage", `${percentage}%`]);
    }

    const sparkleStyle = styleEntries.map(([k, v]) => `${k}:${v};`).join(" ");
    const existingStyle = spreadProps["style"] ?? "";
    const style = sparkleStyle + existingStyle;
    if (style) {
      spreadProps["style"] = style;
    }
  }

  function mergeIntoHost(node: VNode): boolean {
    if (typeof node === "string") return false;
    if (node.attrsHost) {
      Object.assign(node.props, spreadProps);
      return true;
    }
    return node.children.some(mergeIntoHost);
  }

  if (!mergeIntoHost(root)) {
    Object.assign(root.props, spreadProps);
  }

  if (type === "screen" && args["name"]) {
    root.props["id"] = args["name"];
    delete root.props["class"];
  }

  const contentV: VNode =
    typeof args["attributes"]?.content === "string"
      ? interpolate(args["attributes"]?.content, evalCtx)
      : "";

  if (root.contentAttr) {
    root.props[root.contentAttr] =
      typeof args["attributes"]?.content === "string"
        ? interpolate(args["attributes"]?.content, evalCtx)
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
      return injectSlots(ch, args["attributes"]?.content, children, ctx, el);
    })
    .filter(Boolean);

  return root;
}

function injectSlots(
  vnode: VElement,
  content: unknown,
  childNodes: SparkleNode[] | undefined,
  ctx: RenderContext,
  owner: SparkleNode,
): VNode {
  const evalCtx = getContext(ctx);
  const interpolate = ctx.options?.interpolate ?? defaultInterpolate;

  return {
    ...vnode,
    children: vnode.children
      .flatMap((ch) => {
        if (typeof ch === "string") {
          return interpolate(ch, evalCtx);
        }
        if (ch.tag === "content-slot") {
          return typeof content === "string"
            ? interpolate(content, evalCtx)
            : "";
        }
        if (ch.tag === "children-slot") {
          return childNodes?.map((c, i) => renderVNode(c, ctx, owner, i)) || [];
        }
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

    builtin: v.builtin,
    template: v.template,
  };
}

function organizeFills(children: SparkleNode[]): Record<string, SparkleNode[]> {
  const fills: Record<string, SparkleNode[]> = {};
  const otherChildren = [];
  for (const child of children) {
    if (child.type === "fill") {
      const name = child.args?.["name"] ?? "";
      fills[name] ??= [];
      fills[name].push(...(child.children ?? []));
    } else {
      otherChildren.push(child);
    }
  }
  fills[""] ??= [];
  fills[""].push(...otherChildren);
  return fills;
}

function instantiateSlots(
  componentChildren: SparkleNode[],
  fills: Record<string, SparkleNode[]>,
  slotsFound: SparkleNode[],
): SparkleNode[] {
  const output: SparkleNode[] = [];

  for (const child of componentChildren) {
    if (child.type === "slot") {
      const name = child.args?.["name"] ?? "";
      if (fills[name]) {
        output.push(...fills[name]);
      }
      slotsFound.push(child);
    } else {
      const copy: SparkleNode = { ...child, args: { ...(child.args || {}) } };

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

function defaultEvaluate<T>(expr: string, context: Record<string, any>): T {
  try {
    const fn = new Function("context", `with(context) { return (${expr}); }`);
    return fn(context);
  } catch (e) {
    return undefined as T;
  }
}

function defaultInterpolate(
  template: string,
  context: Record<string, any>,
): string {
  try {
    return template.replace(/\\(.|\r\n|\r|\n)|\{(.*?)\}/g, (_, $1, $2) => {
      if ($1) {
        return $1;
      }
      return defaultEvaluate<string>($2, context) ?? "";
    });
  } catch (e) {
    return "";
  }
}

function sparklePropertyToCssProperty(
  key: string,
  value: unknown,
  cssAliases?: Record<string, string>,
) {
  let aliasedKey = cssAliases?.[key] ?? key;
  const cssEntries = getCssEquivalent(aliasedKey, value);
  return cssEntries.map(([k, v]) => `${k}:${v};`).join(" ");
}

function getInheritanceChain(
  type: string,
  components?: Record<string, SparkleNode>,
) {
  const out: string[] = [];
  addToInheritanceChain(type, components, out);
  return out;
}

function addToInheritanceChain(
  type: string,
  components: Record<string, SparkleNode> | undefined,
  out: string[],
) {
  out.push(type);
  if (components) {
    if (type in components) {
      const component = components[type];
      out.push(component!.args?.["name"]);
      addToInheritanceChain(component!.args?.["base"], components, out);
    }
  }
}

function mergeClassesIntoHost(node: VNode, dyn: string): boolean {
  if (typeof node === "string") return false;
  if (node.classHost) {
    const base = node.props["class"] ? node.props["class"] + " " : "";
    node.props["class"] = base + dyn;
    return true;
  }
  return node.children.some((c) => mergeClassesIntoHost(c, dyn));
}
