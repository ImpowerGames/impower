import { type SparkleNode, ParseContext } from "./parser";
import { sparkleSelectorToCssSelector } from "./sparkleSelectorToCssSelector";

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

export type VNode =
  | string
  | { tag: string; props: Record<string, string>; children: VNode[] };

type DOMMutation =
  | { type: "insert"; parent: Node; node: Node; refNode: Node | null }
  | { type: "remove"; parent: Node; node: Node }
  | { type: "replace"; parent: Node; oldNode: Node; newNode: Node }
  | { type: "updateText"; node: Node; text: string }
  | {
      type: "updateProps";
      node: Element;
      oldProps: Record<string, string>;
      newProps: Record<string, string>;
    };

export const DEFAULT_BUILTINS: Record<string, BuiltinDefinition> = {
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
  Area: {
    begin: '<div class="style {classes}" {...attrs}>{{content}}',
    end: "</div>",
  },
  Span: {
    begin: '<span class="style {classes}" {...attrs}>{{content}}',
    end: "</span>",
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

const EMPTY_OBJ = {};

const builtinVNodeCache = new Map<string, VNode>();

const mutationQueue: DOMMutation[] = [];
let scheduled = false;

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
  const builtins = ctx.options?.builtins ?? DEFAULT_BUILTINS;
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

        // Important: attach a key to the first element if missing
        for (const vnode of childVNodes) {
          if (typeof vnode !== "string" && !("key" in vnode.props)) {
            vnode.props.key = key; // Use entry key
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

        // Important: attach a key to the first element if missing
        for (const vnode of childVNodes) {
          if (typeof vnode !== "string" && !("key" in vnode.props)) {
            vnode.props.key = String(i); // Use repeat index
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
  if (type in builtins) {
    return renderBuiltinVNode(el, ctx);
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

function renderBuiltinVNode(el: SparkleNode, ctx: RenderContext): VNode {
  const { type, params, children } = el;

  const builtins = ctx.options?.builtins ?? DEFAULT_BUILTINS;
  const attrAliases = ctx.options?.attrAliases ?? DEFAULT_ATTR_ALIASES;
  const components = ctx.parsed.components;

  const builtin = builtins[type];
  const evalContext = getContext(ctx);

  const childVNodes: VNode[] =
    children?.map((c, i) => renderVNode(c, ctx, el, i)) ?? [];

  const elementContext: Record<string, any> = { ...params };

  const { base, name, classes, ...rest } = params || {};
  const inheritedClassNames =
    type === "component"
      ? getInheritanceChain(base, builtins, components)
      : getInheritanceChain(type, builtins, components);
  elementContext["classes"] = [
    ...(classes ?? []),
    ...inheritedClassNames,
    base,
    name,
  ]
    .filter(Boolean)
    .join(" ");
  elementContext["attrs"] = Object.entries(rest).map(([k, v]) =>
    paramToAttr(k, v, evalContext, attrAliases)
  );

  const fullTemplate =
    interpolate(builtin.begin.trim(), elementContext, attrAliases) +
    "<children></children>" +
    interpolate(builtin.end.trim(), elementContext, attrAliases);

  const populatedBuiltinNode = parseFullBuiltinTemplateToVNode(
    fullTemplate,
    childVNodes
  );
  return populatedBuiltinNode;
}

function parseFullBuiltinTemplateToVNode(
  template: string,
  content: VNode[]
): VNode {
  if (builtinVNodeCache.has(template)) {
    const vnode = builtinVNodeCache.get(template)!;
    return injectContent(cloneVNode(vnode), content);
  }

  const temp = document.createElement("template");
  temp.innerHTML = template;
  const root = temp.content.firstElementChild;
  if (!root) {
    console.error("Could not parse builtin template:", template);
    return { tag: "fragment", props: {}, children: [] };
  }

  const vnode = buildVNodeFromDOM(root, []); // build static template
  builtinVNodeCache.set(template, vnode);
  return injectContent(cloneVNode(vnode), content);
}

function cloneVNode(vnode: VNode): VNode {
  if (typeof vnode === "string") {
    return vnode;
  }
  return {
    tag: vnode.tag,
    props: { ...vnode.props },
    children: vnode.children.map(cloneVNode),
  };
}

function injectContent(vnode: VNode, content: VNode[]): VNode {
  if (typeof vnode === "string") return vnode;

  if (vnode.tag === "children") {
    return content.length === 1
      ? content[0]
      : { tag: "fragment", props: {}, children: content };
  }

  return {
    ...vnode,
    children: vnode.children.map((child) => injectContent(child, content)),
  };
}

function buildVNodeFromDOM(node: Element, content: VNode[]): VNode {
  const props: Record<string, string> = {};
  for (const attr of Array.from(node.attributes)) {
    props[attr.name] = attr.value;
  }

  const children: VNode[] = [];
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      children.push(buildVNodeFromDOM(child as Element, content));
    } else if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent?.trim();
      if (text) children.push(text);
    }
  }

  return {
    tag: node.tagName.toLowerCase(),
    props,
    children,
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

function getInheritanceChain(
  type: string,
  builtins: Record<string, BuiltinDefinition>,
  components?: Record<string, SparkleNode>
) {
  const out: string[] = [];
  addToInheritanceChain(type, builtins, components, out);
  return out;
}

function addToInheritanceChain(
  type: string,
  builtins: Record<string, BuiltinDefinition>,
  components: Record<string, SparkleNode> | undefined,
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

  if (vnode.tag === "style-block" || vnode.tag === "keyframes-block") {
    const styleEl = document.createElement("style");
    if (typeof vnode === "string") {
      styleEl.textContent = vnode;
    }
    return styleEl;
  }

  const el = document.createElement(vnode.tag);

  for (const [key, value] of Object.entries(vnode.props)) {
    if (key.startsWith("on") && typeof value === "function") {
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

export function diffAndPatch(
  container: Node,
  oldVNode: VNode | null,
  newVNode: VNode,
  index: number = 0
): void {
  const existingNode = container.childNodes[index];

  // 1. No old node → Insert
  if (!oldVNode) {
    mutationQueue.push({
      type: "insert",
      parent: container,
      node: createElement(newVNode),
      refNode: existingNode || null,
    });
    scheduleFlush();
    return;
  }

  // 2. No new node → Remove
  if (!newVNode) {
    if (existingNode) {
      mutationQueue.push({
        type: "remove",
        parent: container,
        node: existingNode,
      });
      scheduleFlush();
    }
    return;
  }

  // 3. Different types → Replace
  if (
    typeof oldVNode !== typeof newVNode ||
    (typeof oldVNode !== "string" &&
      typeof newVNode !== "string" &&
      oldVNode.tag !== newVNode.tag)
  ) {
    if (existingNode) {
      mutationQueue.push({
        type: "replace",
        parent: container,
        oldNode: existingNode,
        newNode: createElement(newVNode),
      });
      scheduleFlush();
    }
    return;
  }

  // 4. Text nodes
  if (typeof oldVNode === "string" && typeof newVNode === "string") {
    if (oldVNode !== newVNode && existingNode?.nodeType === Node.TEXT_NODE) {
      mutationQueue.push({
        type: "updateText",
        node: existingNode,
        text: newVNode,
      });
      scheduleFlush();
    }
    return;
  }

  // 5. Normal element nodes
  if (typeof oldVNode !== "string" && typeof newVNode !== "string") {
    if (newVNode.tag === "fragment") {
      const oldChildren = Array.isArray(oldVNode.children)
        ? oldVNode.children
        : [];
      const newChildren = Array.isArray(newVNode.children)
        ? newVNode.children
        : [];
      diffChildren(container, oldChildren, newChildren, index);
      return;
    }

    const el = existingNode as Element;
    if (!el) {
      mutationQueue.push({
        type: "insert",
        parent: container,
        node: createElement(newVNode),
        refNode: null,
      });
      scheduleFlush();
      return;
    }

    mutationQueue.push({
      type: "updateProps",
      node: el,
      oldProps: oldVNode.props,
      newProps: newVNode.props,
    });
    scheduleFlush();

    const oldChildren = oldVNode.children || [];
    const newChildren = newVNode.children || [];
    diffChildren(el, oldChildren, newChildren);
  }
}

function diffChildren(
  parent: Node,
  oldChildren: VNode[],
  newChildren: VNode[],
  startIndex: number = 0
): void {
  let oldStart = 0;
  let newStart = 0;
  let oldEnd = oldChildren.length - 1;
  let newEnd = newChildren.length - 1;

  const oldNodes = Array.from(parent.childNodes).slice(
    startIndex,
    startIndex + oldChildren.length
  );

  // Fast path: match from start
  while (oldStart <= oldEnd && newStart <= newEnd) {
    const oldVNode = oldChildren[oldStart];
    const newVNode = newChildren[newStart];
    if (isSameVNode(oldVNode, newVNode)) {
      diffAndPatch(parent, oldVNode, newVNode, startIndex + newStart);
      oldStart++;
      newStart++;
    } else {
      break;
    }
  }

  // Fast path: match from end
  while (oldStart <= oldEnd && newStart <= newEnd) {
    const oldVNode = oldChildren[oldEnd];
    const newVNode = newChildren[newEnd];
    if (isSameVNode(oldVNode, newVNode)) {
      diffAndPatch(parent, oldVNode, newVNode, startIndex + newEnd);
      oldEnd--;
      newEnd--;
    } else {
      break;
    }
  }

  // Now only unmatched parts remain

  // 1. Insert new nodes
  if (oldStart > oldEnd) {
    const nextNode = parent.childNodes[startIndex + newEnd + 1] || null; // Insert before this node
    for (let i = newStart; i <= newEnd; i++) {
      parent.insertBefore(createElement(newChildren[i]), nextNode);
    }
    return;
  }

  // 2. Remove old nodes
  if (newStart > newEnd) {
    for (let i = oldStart; i <= oldEnd; i++) {
      const node = oldNodes[i];
      if (node) parent.removeChild(node);
    }
    return;
  }

  // 3. Full diff: map new keys
  const oldKeyToIndex = new Map<string, number>();
  for (let i = oldStart; i <= oldEnd; i++) {
    const oldVNode = oldChildren[i];
    if (typeof oldVNode !== "string" && oldVNode.props?.key != null) {
      oldKeyToIndex.set(oldVNode.props.key, i);
    }
  }

  const toMove = new Map<number, number>();

  for (let i = newStart; i <= newEnd; i++) {
    const newVNode = newChildren[i];
    let idxInOld = -1;
    if (typeof newVNode !== "string" && newVNode.props?.key != null) {
      idxInOld = oldKeyToIndex.get(newVNode.props.key) ?? -1;
    }

    if (idxInOld === -1) {
      // New node, insert
      const nextNode = parent.childNodes[startIndex + i] || null;
      parent.insertBefore(createElement(newVNode), nextNode);
    } else {
      // Existing node, patch
      diffAndPatch(parent, oldChildren[idxInOld], newVNode, startIndex + i);
      toMove.set(idxInOld, i);
    }
  }

  // 4. Remove nodes not present anymore
  for (let i = oldStart; i <= oldEnd; i++) {
    if (!toMove.has(i)) {
      const node = oldNodes[i];
      if (node) parent.removeChild(node);
    }
  }
}

function isSameVNode(a: VNode, b: VNode): boolean {
  if (typeof a !== typeof b) return false;
  if (typeof a === "string" && typeof b === "string") return a === b;
  if (typeof a !== "string" && typeof b !== "string") {
    return a.tag === b.tag && (a.props.key ?? null) === (b.props.key ?? null);
  }
  return false;
}

function updatePropsImmediate(
  el: Element,
  oldProps: Record<string, string>,
  newProps: Record<string, string>
): void {
  // Remove old props
  for (const key in oldProps) {
    if (!(key in newProps)) {
      el.removeAttribute(key);
    }
  }
  // Update or add new props
  for (const key in newProps) {
    if (newProps[key] !== oldProps[key]) {
      el.setAttribute(key, newProps[key]);
    }
  }
}

function scheduleFlush() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(flushMutations);
}

function flushMutations() {
  for (const m of mutationQueue) {
    switch (m.type) {
      case "insert":
        m.parent.insertBefore(m.node, m.refNode);
        break;
      case "remove":
        m.parent.removeChild(m.node);
        break;
      case "replace":
        m.parent.replaceChild(m.newNode, m.oldNode);
        break;
      case "updateText":
        if (m.node.textContent !== m.text) {
          m.node.textContent = m.text;
        }
        break;
      case "updateProps":
        updatePropsImmediate(m.node, m.oldProps, m.newProps);
        break;
    }
  }
  mutationQueue.length = 0;
  scheduled = false;
}
