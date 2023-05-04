export const setAttribute = (
  el: Element,
  name: string,
  value: string | null
) => {
  if (value == null) {
    el.removeAttribute(name);
  } else {
    el.setAttribute(name, value);
  }
};
