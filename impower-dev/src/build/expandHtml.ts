import { parse, serialize } from "parse5";
import type { Element } from "parse5/dist/tree-adapters/default";
import { ComponentSpec } from "./ComponentSpec";
import expandComponents from "./expandComponents.js";

const expandHtml = (
  html: string,
  components: Record<string, ComponentSpec>
): string => {
  const doc = parse(html);

  const htmlNode = doc.childNodes.find(
    (node) => "tagName" in node && node.tagName === "html"
  ) as Element;
  const body = htmlNode?.childNodes.find(
    (node) => "tagName" in node && node.tagName === "body"
  ) as Element;

  expandComponents(body, components);

  return serialize(body);
};

export default expandHtml;
