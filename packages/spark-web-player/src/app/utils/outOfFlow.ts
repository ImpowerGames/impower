export function outOfFlow(element: HTMLElement): () => void {
  const style = element.getAttribute("style");
  element.style.setProperty("position", "absolute", "important");
  return () => {
    if (element.getAttribute("style") === style) {
      return;
    }
    if (style == null) {
      element.removeAttribute("style");
    } else {
      element.setAttribute("style", style);
    }
  };
}

export function keptScroll(root: Element): () => void {
  const scrolled = Array.from(root.querySelectorAll<HTMLElement>("*"))
    .filter((el) => el.scrollTop !== 0 || el.scrollLeft !== 0)
    .map((el) => ({ el, top: el.scrollTop, left: el.scrollLeft }));
  return () => {
    for (const { el, top, left } of scrolled) {
      if (el.scrollTop !== top) {
        el.scrollTop = top;
      }
      if (el.scrollLeft !== left) {
        el.scrollLeft = left;
      }
    }
  };
}
