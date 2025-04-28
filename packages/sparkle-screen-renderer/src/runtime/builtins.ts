import { VNode } from "./vnode";

const ATTR_HOST_FLAG = "data-attrs-host";
const CHILDREN_SLOT_FLAG = "data-children-slot";

export interface BuiltinDefinition {
  begin: string;
  end: string;
}

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
  Link: {
    begin: '<a class="style {classes}" {...attrs}>{{content}}',
    end: "</a>",
  },
  Button: {
    begin: '<button class="style {classes}" {...attrs}>{{content}}',
    end: "</button>",
  },
  Image: {
    begin: '<img class="style {classes}" src="{{content-attr}}" {...attrs}/>',
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

export const builtins = new Map<string, VNode>();

(function precompileBuiltins() {
  for (const [name, def] of Object.entries(DEFAULT_BUILTINS)) {
    // choose the proper children-slot marker
    const childSlot = def.begin.includes("<select")
      ? // a valid but hidden <option> sentinel *inside* <select>
        `<option ${CHILDREN_SLOT_FLAG} hidden></option>`
      : // any other tag can use the custom element
        "<children-slot></children-slot>";

    const tpl = (def.begin + childSlot + def.end)
      .replaceAll("{...attrs}", ` ${ATTR_HOST_FLAG}`) // attrs host
      .replaceAll("{{content}}", "<content-slot></content-slot>"); // content

    const temp = document.createElement("template");
    temp.innerHTML = tpl.trim();
    const root = temp.content.firstElementChild;
    if (!root) {
      console.error("Failed to parse builtin:", name);
      continue;
    }
    const vnode = buildVNodeFromDOM(root);
    builtins.set(name, vnode);
  }
})();

function buildVNodeFromDOM(node: Element): VNode {
  const props: Record<string, string> = {};
  let contentAttr: string | undefined;
  let attrsHost = false;
  let classHost = false;

  // recognise <option data-children-slot>
  if (
    node.tagName.toLowerCase() === "option" &&
    node.hasAttribute(CHILDREN_SLOT_FLAG)
  ) {
    return { tag: "children-slot", props: {}, children: [] };
  }

  for (const a of Array.from(node.attributes)) {
    if (a.name === ATTR_HOST_FLAG) {
      attrsHost = true;
      continue;
    }

    if (a.name === "class" && a.value.includes("{classes}")) {
      classHost = true;
      const cleaned = a.value.replace("{classes}", "").trim();
      if (cleaned) {
        props.class = cleaned; // keep static part
      }
      continue; // drop the placeholder
    }

    if (a.value === "{{content-attr}}") {
      // remember: this attribute hosts the `content`
      contentAttr = a.name; // remember which attribute
      continue; // do NOT store the sentinel
    }

    props[a.name] = a.value;
  }

  const children: VNode[] = [];
  node.childNodes.forEach((ch) => {
    if (ch.nodeType === Node.ELEMENT_NODE) {
      children.push(buildVNodeFromDOM(ch as Element));
    } else if (
      ch.nodeType === Node.TEXT_NODE &&
      ch.textContent!.trim().length // ignore pure whitespace
    ) {
      children.push(ch.textContent!.trim());
    }
  });

  const vnode: VNode = {
    tag: node.tagName.toLowerCase(),
    props,
    children,
    ...(contentAttr && { contentAttr }),
    ...(attrsHost && { attrsHost: true }),
    ...(classHost && { classHost: true }),
  };
  return vnode;
}
