import { setAttribute } from "./setAttribute";

export const updateAttribute = <T>(el: Element, name: string, value: T) => {
  if (value == null) {
    setAttribute(el, name, null);
  } else if (typeof value === "boolean") {
    setAttribute(el, name, value ? "" : null);
  } else if (typeof value === "string") {
    setAttribute(el, name, value ? value : null);
  } else {
    setAttribute(el, name, String(value));
  }
};
