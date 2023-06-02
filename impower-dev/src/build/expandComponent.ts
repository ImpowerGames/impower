import { parseFragment as fragment } from "parse5";
import type { Attribute } from "parse5/dist/common/token";
import type { Element } from "parse5/dist/tree-adapters/default";

const attrsArrayToMap = (attrs: Attribute[]): Record<string, string> => {
  const obj: Record<string, string> = {};
  [...attrs].forEach((attr) => (obj[attr.name] = attr.value));
  return obj;
};

const expandComponent = (data?: {
  name?: string;
  components?: Record<
    string,
    () => { css?: string; html?: string; js?: string }
  >;
  attrs?: Attribute[];
  state?: {
    attrs?: Record<string, string>;
    context?: Record<string, unknown>;
    store?: Record<string, unknown>;
    instanceID?: string;
  };
}): Element => {
  const name = data?.name ?? "";
  const components = data?.components ?? {};
  const attrs = attrsArrayToMap(data?.attrs || []);
  const state = data?.state ?? {};
  state.attrs = attrs;

  const component = components[name];

  if (component && typeof component === "function") {
    const { html } = component();
    return fragment(html || "") as Element;
  } else {
    throw new Error(`Could not find the template function for ${name}`);
  }
};

export default expandComponent;
