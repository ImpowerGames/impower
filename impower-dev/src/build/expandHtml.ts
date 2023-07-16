import { customAlphabet } from "nanoid";
import { parse, serialize } from "parse5";
import type { Element } from "parse5/dist/tree-adapters/default";
import expandComponents from "./expandComponents.js";

const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
const nanoid = customAlphabet(alphabet, 14);

const expandHtml = (
  html: string,
  options?: {
    components?: Record<
      string,
      () => { css?: string; html?: string; js?: string }
    >;
    store?: Record<string, unknown>;
    uuid?: (size?: number | undefined) => string;
  }
): string => {
  const components = options?.components ?? {};
  const store = options?.store ?? {};
  const uuid = options?.uuid ?? nanoid;

  const doc = parse(html);

  const htmlNode = doc.childNodes.find(
    (node) => "tagName" in node && node.tagName === "html"
  ) as Element;
  const body = htmlNode?.childNodes.find(
    (node) => "tagName" in node && node.tagName === "body"
  ) as Element;

  expandComponents(body, { components, store, uuid });

  return serialize(body);
};

export default expandHtml;
