import type { Element } from "parse5/dist/tree-adapters/default";
import { ComponentSpec } from "./ComponentSpec";
import expandComponent from "./expandComponent.js";
import fillSlots from "./fillSlots.js";
import isCustomElement from "./isCustomElement.js";

const expandComponents = (
  node: Element,
  components: Record<string, ComponentSpec>
) => {
  const expand = (node: Element) => {
    if (isCustomElement(node.tagName) && components[node.tagName]) {
      const expandedTemplate =
        expandComponent(node.tagName, node.attrs, components) || "";
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
