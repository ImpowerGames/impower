import type { Element } from "parse5/dist/tree-adapters/default";
import { ComponentState } from "./ComponentState.js";
import expandComponent from "./expandComponent.js";
import fillSlots from "./fillSlots.js";
import isCustomElement from "./isCustomElement.js";

const expandComponents = (
  node: Element,
  options: {
    components: Record<
      string,
      (state?: ComponentState) => { css?: string; html?: string; js?: string }
    >;
    store: Record<string, unknown>;
    uuid: (size?: number | undefined) => string;
  }
) => {
  const components = options.components;
  const store = options.store;
  const uuid = options.uuid;
  const context = {};
  const expand = (node: Element) => {
    if (isCustomElement(node.tagName) && components[node.tagName]) {
      const expandedTemplate =
        expandComponent({
          name: node.tagName,
          components,
          attrs: node.attrs,
          state: {
            context,
            instanceID: uuid(),
            store,
          },
        }) || "";
      fillSlots(node, expandedTemplate);
    }
    node.childNodes.forEach((child) => {
      if ("tagName" in child) {
        expand(child);
      }
    });
  };
  expand(node);
};

export default expandComponents;
