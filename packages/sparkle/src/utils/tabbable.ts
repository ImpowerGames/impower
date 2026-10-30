const isTabbable = (el: HTMLElement) => {
  const tag = el.tagName.toLowerCase();

  if (el.getAttribute("tabindex") === "-1") {
    return false;
  }

  if (el.hasAttribute("disabled")) {
    return false;
  }

  if (
    el.hasAttribute("aria-disabled") &&
    el.getAttribute("aria-disabled") !== "false"
  ) {
    return false;
  }

  if (
    tag === "input" &&
    el.getAttribute("type") === "radio" &&
    !el.hasAttribute("checked")
  ) {
    return false;
  }

  if (el.offsetParent === null) {
    return false;
  }

  if (window.getComputedStyle(el).visibility === "hidden") {
    return false;
  }

  if ((tag === "audio" || tag === "video") && el.hasAttribute("controls")) {
    return true;
  }

  if (el.hasAttribute("tabindex")) {
    return true;
  }

  if (
    el.hasAttribute("contenteditable") &&
    el.getAttribute("contenteditable") !== "false"
  ) {
    return true;
  }

  return [
    "button",
    "input",
    "select",
    "textarea",
    "a",
    "audio",
    "video",
    "summary",
  ].includes(tag);
};

export const getTabbableBoundary = (root: HTMLElement | ShadowRoot) => {
  const allElements: HTMLElement[] = [];

  const walk = (el: HTMLElement | ShadowRoot) => {
    if (el instanceof HTMLElement) {
      allElements.push(el);

      if (el.shadowRoot !== null && el.shadowRoot.mode === "open") {
        walk(el.shadowRoot);
      }
    }

    Array.from(el.children).forEach((e: Element) => walk(e as HTMLElement));
  };

  walk(root);

  const start = allElements.find((el) => isTabbable(el)) ?? null;
  const end = allElements.reverse().find((el) => isTabbable(el)) ?? null;

  return { start, end };
};
