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
  box: {
    begin: `<div class="style ${CLASSES_PLACEHOLDER}" ${ATTRS_PLACEHOLDER}>${CONTENT_CHILDREN_PLACEHOLDER}`,
    end: `</div>`,
  },
  span: {
    begin: `<span class="style ${CLASSES_PLACEHOLDER}" ${ATTRS_PLACEHOLDER}>${CONTENT_CHILDREN_PLACEHOLDER}`,
    end: `</span>`,
  },
  scroller: {
    begin: `<div class="style ${CLASSES_PLACEHOLDER}" ${ATTRS_PLACEHOLDER}>${CONTENT_CHILDREN_PLACEHOLDER}`,
    end: `</div>`,
  },
  text: {
    begin: `<div class="style ${CLASSES_PLACEHOLDER}" ${ATTRS_PLACEHOLDER}>${CONTENT_CHILDREN_PLACEHOLDER}`,
    end: `</div>`,
  },
  stroke: {
    begin: `<div class="style ${CLASSES_PLACEHOLDER}" ${ATTRS_PLACEHOLDER}>${CONTENT_CHILDREN_PLACEHOLDER}`,
    end: `</div>`,
  },
  link: {
    begin: `<a class="style ${CLASSES_PLACEHOLDER}" ${ATTRS_PLACEHOLDER}>${CONTENT_CHILDREN_PLACEHOLDER}`,
    end: `</a>`,
  },
  button: {
    begin: `<button class="style ${CLASSES_PLACEHOLDER}" ${ATTRS_PLACEHOLDER}>${CONTENT_CHILDREN_PLACEHOLDER}`,
    end: `</button>`,
  },
  image: {
    begin: `<img class="style ${CLASSES_PLACEHOLDER}" src="${CONTENT_ATTR_PLACEHOLDER}" ${ATTRS_PLACEHOLDER}/>`,
    end: "",
  },
  mask: {
    begin: `<img class="style ${CLASSES_PLACEHOLDER}" src="${CONTENT_ATTR_PLACEHOLDER}" ${ATTRS_PLACEHOLDER}/>`,
    end: "",
  },
  label: {
    begin: `<label class="style ${CLASSES_PLACEHOLDER}" ${ATTRS_PLACEHOLDER}>${CONTENT_CHILDREN_PLACEHOLDER}`,
    end: `</label>`,
  },
  field: {
    begin: `<input class="style ${CLASSES_PLACEHOLDER}" ${ATTRS_PLACEHOLDER}>${CONTENT_CHILDREN_PLACEHOLDER}`,
    end: `</input>`,
  },
  input: {
    begin: `<label class="style ${CLASSES_PLACEHOLDER}"><div class="style input_label">${CONTENT_CHILDREN_PLACEHOLDER}`,
    end: `</div><input class="style input_field" type="text" ${ATTRS_PLACEHOLDER}/></label>`,
  },
  slider: {
    begin: `<label class="style ${CLASSES_PLACEHOLDER}"><div class="style slider_label">${CONTENT_CHILDREN_PLACEHOLDER}`,
    end: `</div><input class="style slider_field" type="range" ${ATTRS_PLACEHOLDER} oninput="this.style.setProperty('---fill-percentage', (this.value-this.min)/(this.max-this.min)*100 + '%')"/></label>`,
  },
  checkbox: {
    begin: `<label class="style ${CLASSES_PLACEHOLDER}"><div class="style checkbox_label">${CONTENT_CHILDREN_PLACEHOLDER}`,
    end: `</div><input class="style checkbox_field" type="checkbox" ${ATTRS_PLACEHOLDER}/></label>`,
  },
  dropdown: {
    begin: `<label class="style ${CLASSES_PLACEHOLDER}"><div class="style dropdown_label">${CONTENT_CHILDREN_PLACEHOLDER}</div><div class="style dropdown_arrow"><select class="style dropdown_field" ${ATTRS_PLACEHOLDER}>`,
    end: `</select></div></label>`,
  },
  option: {
    begin: `<option class="style ${CLASSES_PLACEHOLDER}" ${ATTRS_PLACEHOLDER}>${CONTENT_CHILDREN_PLACEHOLDER}`,
    end: `</option>`,
  },
  divider: { begin: `<hr>`, end: "" },
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
