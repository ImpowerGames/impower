import { VNode } from "./vnode";

export function createElement(vnode: VNode): Node {
  if (typeof vnode === "string") return document.createTextNode(vnode);

  if (vnode.builtin && vnode.template) {
    const frag = vnode.template.content.cloneNode(true) as DocumentFragment;
    const root = frag.firstElementChild! as HTMLElement;
    if (root.tagName.toLowerCase() === "fragment") {
      const frag = document.createDocumentFragment();
      vnode.children.forEach((ch) => frag.appendChild(createElement(ch)));
      return frag;
    }

    for (const [k, v] of Object.entries(vnode.props)) {
      setAttribute(root, k, v);
    }

    while (root.firstChild) {
      root.removeChild(root.firstChild);
    }
    vnode.children.forEach((ch) => root.appendChild(createElement(ch)));

    return root;
  }

  if (vnode.tag === "fragment") {
    const frag = document.createDocumentFragment();
    vnode.children.forEach((ch) => frag.appendChild(createElement(ch)));
    return frag;
  }

  const el = document.createElement(vnode.tag);
  for (const [k, v] of Object.entries(vnode.props)) {
    setAttribute(el, k, v);
  }
  vnode.children.forEach((ch) => el.appendChild(createElement(ch)));
  return el;
}

export function removeAttribute(el: Element, key: string) {
  if (key.startsWith("@")) {
  } else {
    el.removeAttribute(key);
  }
}

export function setAttribute(el: Element, key: string, value: string) {
  if (key.startsWith("@")) {
  } else {
    if (value === "true") {
      el.setAttribute(key, "");
    } else if (value === "false") {
      el.removeAttribute(key);
    } else {
      el.setAttribute(key, value);
    }
  }
}
