import { VNode } from "./vnode";

export function createElement(vnode: VNode): Node {
  /* ------------ TEXT ------------------------------------------------ */
  if (typeof vnode === "string") return document.createTextNode(vnode);

  /* ------------ BUILTIN fast-path ----------------------------------- */
  if (vnode.builtin && vnode.template) {
    // 1. clone the whole static subtree in native code
    const frag = vnode.template.content.cloneNode(true) as DocumentFragment;
    const root = frag.firstElementChild! as HTMLElement; // root always present

    // 2. patch *root* attributes that are dynamic (class, id, ...)
    //    deep attrsHosts were already handled while building vnode
    for (const [k, v] of Object.entries(vnode.props)) {
      setAttribute(root, k, v);
    }

    // 3. if the children array changed (content-slot / custom children),
    //    just wipe the slot-sentinel and insert the rendered children.
    if (vnode.children.length) {
      while (root.firstChild) {
        root.removeChild(root.firstChild);
      }
      vnode.children.forEach((ch) => root.appendChild(createElement(ch)));
    }

    return root; // <-- one single DOM node returned
  }

  /* ------------ generic fragment ------------------------------------ */
  if (vnode.tag === "fragment") {
    const frag = document.createDocumentFragment();
    vnode.children.forEach((ch) => frag.appendChild(createElement(ch)));
    return frag;
  }

  /* ------------ generic element (slow path) ------------------------- */
  const el = document.createElement(vnode.tag);
  for (const [k, v] of Object.entries(vnode.props)) {
    setAttribute(el, k, v);
  }
  vnode.children.forEach((ch) => el.appendChild(createElement(ch)));
  return el;
}

export function setAttribute(el: Element, key: string, value: string) {
  if (key.startsWith("@")) {
    // TODO: addEventListener
  } else {
    if (value === "true") {
      // True booleans are simply attributes set to empty string
      el.setAttribute(key, "");
    } else if (value === "false") {
      // False boolean attributes are simply removed
      el.removeAttribute(key);
    } else {
      el.setAttribute(key, value);
    }
  }
}
