import { VElement, VNode } from "./vnode";

const ATTR_HOST_FLAG = "data-attrs-host";
const CHILDREN_SLOT_FLAG = "data-children-slot";
const CONTENT_CHILDREN_PLACEHOLDER = "{content}";
const CONTENT_ATTR_PLACEHOLDER = "{content-attr}";
const ATTRS_PLACEHOLDER = "{...attrs}";
const CLASSES_PLACEHOLDER = "{...classes}";

/* ---------------- Public API -------------------- */

export interface BuiltinInfo {
  /** frozen V-Node skeleton, safe to share across renders */
  vnode: Readonly<VNode>;
  /** parsed DOM template (for createElement fast-path)    */
  template: HTMLTemplateElement;
}

export const builtins = new Map<string, BuiltinInfo>();

/* ---------- Builtin HTML sources ----------------- */

type BuiltinDefinition = { begin: string; end: string };

const SRC: Record<string, BuiltinDefinition> = {
  screen: {
    begin: `<div class="style screen" ${ATTRS_PLACEHOLDER}>${CONTENT_CHILDREN_PLACEHOLDER}`,
    end: `</div>`,
  },
  component: {
    begin: `<fragment ${ATTRS_PLACEHOLDER}>${CONTENT_CHILDREN_PLACEHOLDER}`,
    end: `</fragment>`,
  },
  "": {
    begin: `<div class="style ${CLASSES_PLACEHOLDER}" ${ATTRS_PLACEHOLDER}>${CONTENT_CHILDREN_PLACEHOLDER}`,
    end: `</div>`,
  },
  Area: {
    begin: `<div class="style ${CLASSES_PLACEHOLDER}" ${ATTRS_PLACEHOLDER}>${CONTENT_CHILDREN_PLACEHOLDER}`,
    end: `</div>`,
  },
  Span: {
    begin: `<span class="style ${CLASSES_PLACEHOLDER}" ${ATTRS_PLACEHOLDER}>${CONTENT_CHILDREN_PLACEHOLDER}`,
    end: `</span>`,
  },
  Box: {
    begin: `<div class="style ${CLASSES_PLACEHOLDER}" ${ATTRS_PLACEHOLDER}>${CONTENT_CHILDREN_PLACEHOLDER}`,
    end: `</div>`,
  },
  Row: {
    begin: `<div class="style ${CLASSES_PLACEHOLDER}" ${ATTRS_PLACEHOLDER}>${CONTENT_CHILDREN_PLACEHOLDER}`,
    end: `</div>`,
  },
  Column: {
    begin: `<div class="style ${CLASSES_PLACEHOLDER}" ${ATTRS_PLACEHOLDER}>${CONTENT_CHILDREN_PLACEHOLDER}`,
    end: `</div>`,
  },
  Grid: {
    begin: `<div class="style ${CLASSES_PLACEHOLDER}" ${ATTRS_PLACEHOLDER}>${CONTENT_CHILDREN_PLACEHOLDER}`,
    end: `</div>`,
  },
  Text: {
    begin: `<div class="style ${CLASSES_PLACEHOLDER}" ${ATTRS_PLACEHOLDER}>${CONTENT_CHILDREN_PLACEHOLDER}`,
    end: `</div>`,
  },
  Link: {
    begin: `<a class="style ${CLASSES_PLACEHOLDER}" ${ATTRS_PLACEHOLDER}>${CONTENT_CHILDREN_PLACEHOLDER}`,
    end: `</a>`,
  },
  Button: {
    begin: `<button class="style ${CLASSES_PLACEHOLDER}" ${ATTRS_PLACEHOLDER}>${CONTENT_CHILDREN_PLACEHOLDER}`,
    end: `</button>`,
  },
  Image: {
    begin: `<img class="style ${CLASSES_PLACEHOLDER}" src="${CONTENT_ATTR_PLACEHOLDER}" ${ATTRS_PLACEHOLDER}/>`,
    end: "",
  },
  Input: {
    begin: `<label class="style Control"><span class="style Label">${CONTENT_CHILDREN_PLACEHOLDER}`,
    end: `</span><input class="style ${CLASSES_PLACEHOLDER}" type="text" ${ATTRS_PLACEHOLDER}/></label>`,
  },
  InputArea: {
    begin: `<label class="style Control"><span class="style Label">${CONTENT_CHILDREN_PLACEHOLDER}`,
    end: `</span><textarea class="style ${CLASSES_PLACEHOLDER}" ${ATTRS_PLACEHOLDER}/></label>`,
  },
  Slider: {
    begin: `<label class="style Control"><span class="style Label">${CONTENT_CHILDREN_PLACEHOLDER}`,
    end: `</span><input class="style ${CLASSES_PLACEHOLDER}" type="range" oninput="this.style.setProperty('---fill-percentage', (this.value-this.min)/(this.max-this.min)*100 + '%')" ${ATTRS_PLACEHOLDER}/></label>`,
  },
  Checkbox: {
    begin: `<label class="style Control"><span class="style Label">${CONTENT_CHILDREN_PLACEHOLDER}`,
    end: `</span><input class="style ${CLASSES_PLACEHOLDER}" type="checkbox" ${ATTRS_PLACEHOLDER}/></label>`,
  },
  Dropdown: {
    begin: `<label class="style Control"><span class="style Label">${CONTENT_CHILDREN_PLACEHOLDER}</span><div class="style DropdownArrow"><select class="style ${CLASSES_PLACEHOLDER}" ${ATTRS_PLACEHOLDER}>`,
    end: `</select></div></label>`,
  },
  Option: {
    begin: `<option class="style ${CLASSES_PLACEHOLDER}" ${ATTRS_PLACEHOLDER}>${CONTENT_CHILDREN_PLACEHOLDER}`,
    end: `</option>`,
  },
  Space: {
    begin: `<div class="style ${CLASSES_PLACEHOLDER}" ${ATTRS_PLACEHOLDER}>${CONTENT_CHILDREN_PLACEHOLDER}`,
    end: `</div>`,
  },
  Divider: { begin: `<hr>`, end: "" },
};

/* ---------- one-time compilation -------------------------------- */

(function compile() {
  const t = document.createElement("template");

  for (const [name, def] of Object.entries(SRC)) {
    // build expanded HTML string
    const childSlot = def.begin.includes("<select")
      ? `<option ${CHILDREN_SLOT_FLAG} hidden></option>`
      : "<children-slot></children-slot>";

    // replace ATTRS_PLACEHOLDER once, replace CONTENT_CHILDREN_PLACEHOLDER once
    const html = (def.begin + childSlot + def.end)
      .replace(ATTRS_PLACEHOLDER, ATTR_HOST_FLAG)
      .replace(CONTENT_CHILDREN_PLACEHOLDER, "<content-slot></content-slot>");

    // create <template>
    t.innerHTML = html.trim();
    const template = t.cloneNode(true) as HTMLTemplateElement;

    const rawVNode = buildVNodeFromDOM(template.content.firstElementChild!);

    // remove data-attrs-host from every element, incl. the root, since we don't need it anymore
    for (const el of template.content.querySelectorAll(`[${ATTR_HOST_FLAG}]`)) {
      (el as Element).removeAttribute(ATTR_HOST_FLAG);
    }

    // add fast-path breadcrumbs first
    (rawVNode as VElement).builtin = name;
    (rawVNode as VElement).template = template; // the <template> we just built

    // now deep-freeze the whole thing
    const vnode = freezeVNode(rawVNode);

    builtins.set(name, { vnode, template });
  }
})();

/* ---------- Helpers: DOM -> V-Dom skeleton ------------ */

function freezeVNode(v: VNode): Readonly<VNode> {
  if (typeof v === "string") return v;
  v.children = v.children.map((c) => freezeVNode(c)) as any;
  return Object.freeze(v);
}

function buildVNodeFromDOM(el: Element): VNode {
  if (
    el.tagName.toLowerCase() === "option" &&
    el.hasAttribute(CHILDREN_SLOT_FLAG)
  ) {
    return { tag: "children-slot", props: {}, children: [] };
  }

  const props: Record<string, string> = {};
  let contentAttr: string | undefined;
  let attrsHost = false,
    classHost = false;

  for (const a of Array.from(el.attributes)) {
    if (a.name === ATTR_HOST_FLAG) {
      attrsHost = true;
      continue;
    }

    if (a.name === "class" && a.value.includes(CLASSES_PLACEHOLDER)) {
      classHost = true;
      const fixed = a.value.replace(CLASSES_PLACEHOLDER, "").trim();
      if (fixed) {
        props.class = fixed;
      }
      continue;
    }

    if (a.value === CONTENT_ATTR_PLACEHOLDER) {
      contentAttr = a.name;
      continue;
    }
    props[a.name] = a.value;
  }

  const children: VNode[] = [];
  el.childNodes.forEach((n) => {
    if (n.nodeType === Node.ELEMENT_NODE) {
      children.push(buildVNodeFromDOM(n as Element));
    } else if (n.nodeType === Node.TEXT_NODE && n.textContent!.trim()) {
      children.push(n.textContent!.trim());
    }
  });

  return {
    tag: el.tagName.toLowerCase(),
    props,
    children,
    ...(contentAttr && { contentAttr }),
    ...(attrsHost && { attrsHost: true }),
    ...(classHost && { classHost: true }),
  };
}
