export const createImageElement = (
  parent: HTMLElement,
  property: string,
  background: string,
  imageNames: string,
  src: string | undefined,
  applyStyle: (
    el: HTMLElement,
    style: Record<string, string | number | null>,
  ) => void,
): HTMLElement => {
  const doc = parent.ownerDocument;
  const el = doc.createElement("span");
  el.className = "instance";
  el.setAttribute("image", imageNames);
  applyStyle(el, { [property]: background });
  if (src) {
    const img = doc.createElement("img");
    img.className = "object";
    img.setAttribute("src", src);
    el.appendChild(img);
  }
  parent.appendChild(el);
  return el;
};
