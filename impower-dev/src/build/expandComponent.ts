import { parseFragment as fragment } from "parse5";
import type { Attribute } from "parse5/dist/common/token";
import type { Element } from "parse5/dist/tree-adapters/default";
import { ComponentSpec } from "./ComponentSpec";

const convertKebabToCamelCase = (s: string): string =>
  s.replace(/[-](\w\w$|\w)/g, (_, l) => l.toUpperCase());

const getPropValue = (attrValue: string | null, defaultPropValue: unknown) => {
  if (attrValue === undefined) {
    return defaultPropValue;
  } else if (attrValue === null) {
    return defaultPropValue;
  } else if (typeof defaultPropValue === "boolean") {
    return attrValue != null;
  } else if (typeof defaultPropValue === "number") {
    return Number(attrValue);
  } else {
    return attrValue;
  }
};

const attrsToProps = (
  attrs: Attribute[],
  defaultProps: Record<string, unknown>
): Record<string, unknown> => {
  const obj: Record<string, unknown> = {};
  [...attrs].forEach((attr) => {
    const attrName = attr.name;
    const attrValue = attr.value;
    const propName = convertKebabToCamelCase(attrName);
    const defaultPropValue = defaultProps[propName];
    obj[propName] = getPropValue(attrValue, defaultPropValue);
  });
  return obj;
};

const expandComponent = (
  name: string,
  attrs: Attribute[],
  components: Record<string, ComponentSpec>
): Element => {
  const component = components[name];

  if (component) {
    const html = component.html;
    const store = component.cache.get();
    const reducer = component.reducer;
    const defaultProps = component.props;
    const defaultState = reducer(store);
    const props = { ...defaultProps, ...attrsToProps(attrs, defaultProps) };
    const state = { ...defaultState };
    const content = html({ props, state });
    return fragment(content) as Element;
  } else {
    throw new Error(`Could not find component spec for ${name}`);
  }
};

export default expandComponent;
