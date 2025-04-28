import { type SparkleNode, ParseContext } from "../parser/parser";
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
  parsed: ParseContext;
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
  const { type, params, children } = el;
  const components = ctx.parsed.components;
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
            evaluate(sibling.params?.condition, getContext(ctx))
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
      const asKeys = params?.as?.split(",").map((k: string) => k.trim());
      const items = entries.flatMap(([key, value]) => {
        const newScope =
          asKeys?.length > 1
            ? { [asKeys[0]]: key, [asKeys[1]]: value }
            : { [params?.as]: value };
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
            evaluate(child.params?.value, getContext(ctx)) === value
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
  }

  // Otherwise normal node
  const builtin = builtins.get(type);
  if (builtin) {
    return renderBuiltinVNode(el, ctx, builtin);
  }

  if (el.root === "screen" || el.root === "component") {
    const compDef = components?.[type];
    if (!compDef) {
      console.error("Component not found:", type);
      return { tag: "fragment", props: {}, children: [] };
    }
    const fills = organizeFills(children ?? []);
    const instantiatedComponent: SparkleNode = {
      ...compDef,
      type: compDef.params?.base,
      params: { ...params, name: type },
      children: instantiateSlots(compDef.children ?? [], fills),
    };
    return {
      tag: "div",
      props: {},
      children:
        instantiatedComponent.children?.map((c, i) =>
          renderVNode(c, ctx, instantiatedComponent, i)
        ) ?? [],
    };
  }

  if (el.root === "style") {
    if (type === "style") {
      // Special case: build a style block
      const styleContent = (children ?? [])
        .map((c, i) => renderVNode(c, ctx, el, i))
        .join(" ");
      const name = el.params?.name;
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
        .join(" ");
      const name = el.params?.name;
      return {
        tag: "style",
        props: {},
        children: [`@keyframes ${name} { ${styleContent} }`],
      };
    }
    if (type === "prop") {
      return paramToProp(params?.key, params?.value, cssAliases);
    }
    if (type === "keyframes" && children?.length) {
      const max = children.length - 1;
      return children
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
    }
    return "";
  }

  console.warn("Unhandled node type:", type, el);
  return { tag: "fragment", props: {}, children: [] };
}

function wrapChildren(children: VNode[]): VNode {
  if (children.length === 1) return children[0];
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
  const { type, params = {}, children } = el;
  const components = ctx.parsed.components;
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
  for (const [k, v] of Object.entries(params).filter(
    ([k]) => !["classes", "content", "base", "name"].includes(k)
  )) {
    spreadProps[k] =
      typeof v === "string" ? interpolate(v, evalCtx) : String(v);
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
    typeof params.content === "string"
      ? interpolate(params.content, evalCtx)
      : "";

  if (root.contentAttr) {
    root.props[root.contentAttr] =
      typeof params.content === "string"
        ? interpolate(params.content, evalCtx)
        : "";
  }

  root.children = root.children.map((ch) => {
    if (typeof ch === "string") return ch;
    if (ch.tag === "content-slot") return contentV;
    if (ch.tag === "children-slot")
      return wrapChildren(
        children?.map((c, i) => renderVNode(c, ctx, el, i)) || []
      );
    // recurse
    return injectSlots(ch, params.content, children, ctx, el);
  });

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
    children: vnode.children.map((ch) => {
      if (typeof ch === "string") {
        // "plain" text inside the builtin: run interpolation on it too
        return ch.includes("{") ? interpolate(ch, evalCtx) : ch;
      }

      if (ch.tag === "content-slot") {
        return typeof content === "string" ? interpolate(content, evalCtx) : "";
      }
      if (ch.tag === "children-slot") {
        return wrapChildren(
          childNodes?.map((c, i) => renderVNode(c, ctx, owner, i)) || []
        );
      }
      // recurse
      return injectSlots(ch, content, childNodes, ctx, owner);
    }),
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
    ...(v.attrsHost && { attrsHost: true }),
    ...(v.classHost && { classHost: true }),
  };
}

function organizeFills(children: SparkleNode[]): Record<string, SparkleNode[]> {
  const fills: Record<string, SparkleNode[]> = {};
  for (const child of children) {
    if (child.type === "fill" && child.params?.name) {
      (fills[child.params.name] ??= []).push(...(child.children ?? []));
    }
  }
  return fills;
}

function instantiateSlots(
  componentChildren: SparkleNode[],
  fills: Record<string, SparkleNode[]>
): SparkleNode[] {
  const output: SparkleNode[] = [];
  for (const child of componentChildren) {
    if (child.type === "slot") {
      if (child.params?.name && fills[child.params.name]) {
        output.push(...fills[child.params.name]);
      }
    } else {
      output.push(child);
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
      out.push(component.params?.name);
      addToInheritanceChain(component.params?.base, components, out);
    }
  }
}

export function renderCssVDOM(parsed: ParseContext, ctx: RenderContext): VNode {
  const children: VNode[] = [];
  if (parsed.animations) {
    for (const animation of Object.values(parsed.animations)) {
      children.push(renderVNode(animation, ctx));
    }
  }
  if (parsed.styles) {
    for (const style of Object.values(parsed.styles)) {
      children.push(renderVNode(style, ctx));
    }
  }
  return wrapChildren(children);
}

export function renderHtmlVDOM(
  parsed: ParseContext,
  ctx: RenderContext,
  screenName?: string
): VNode {
  if (!parsed.screens) {
    return {
      tag: "fragment",
      props: {},
      children: [],
    };
  }
  if (screenName) {
    return renderVNode(parsed.screens[screenName], ctx);
  }
  const children: VNode[] = [];
  if (parsed.screens) {
    for (const screen of Object.values(parsed.screens)) {
      children.push(renderVNode(screen, ctx));
    }
  }
  return wrapChildren(children);
}

export function createElement(vnode: VNode): Node {
  if (typeof vnode === "string") {
    return document.createTextNode(vnode);
  }

  if (vnode.tag === "fragment") {
    const fragment = document.createDocumentFragment();
    for (const child of vnode.children) {
      fragment.appendChild(createElement(child));
    }
    return fragment;
  }

  const el = document.createElement(vnode.tag);

  for (const [key, value] of Object.entries(vnode.props)) {
    if (key.startsWith("@")) {
      // TODO: EventHandler
      // const eventName = key.slice(2).toLowerCase();
      // el.addEventListener(eventName, value as EventListener);
    } else if (value != null) {
      el.setAttribute(key, value);
    }
  }

  for (const child of vnode.children) {
    el.appendChild(createElement(child));
  }

  return el;
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
