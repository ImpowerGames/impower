import { isScrollable } from "./isScrollable";

export const getScrollableParent = (el: Element | null): Window | Element => {
  if (!el || el === document.documentElement) {
    return window;
  }
  if (isScrollable(el)) {
    return el;
  }
  if (el.shadowRoot) {
    const firstElementChild = el.shadowRoot.firstElementChild;
    if (firstElementChild) {
      if (isScrollable(firstElementChild)) {
        return firstElementChild;
      }
    }
  }
  if (el.parentElement) {
    return getScrollableParent(el.parentElement);
  }
  const root = el.getRootNode();
  const host = (root as ShadowRoot)?.host;
  if (host) {
    if (host.slot) {
      const slotted = host.parentElement?.shadowRoot?.querySelector(
        `slot[name=${host.slot}]`
      );
      if (slotted) {
        return getScrollableParent(slotted);
      }
    }
    return getScrollableParent(host.parentElement);
  } else {
    return getScrollableParent(el.parentElement);
  }
};
