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
