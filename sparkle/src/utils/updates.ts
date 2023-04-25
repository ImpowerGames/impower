const setAttribute = (el: Element, name: string, value: string | null) => {
  if (value == null) {
    el.removeAttribute(name);
  } else {
    el.setAttribute(name, value);
  }
};

export const updateAttribute = <T>(el: Element, name: string, value: T) => {
  if (typeof value === "boolean") {
    setAttribute(el, name, value ? "" : null);
  } else if (typeof value === "string") {
    setAttribute(el, name, value ? value : null);
  } else {
    setAttribute(el, name, String(value));
  }
};
