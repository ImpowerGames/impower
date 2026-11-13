export type Keyboard = { open: boolean; height: number };

const OPEN_CLASS = "keyboard-open";

const CLOSED: Keyboard = { open: false, height: 0 };

export const KEYBOARD_MIN_HEIGHT = 140;

const listeners = new Set<(keyboard: Keyboard) => void>();
let holders = 0;
let last: Keyboard = CLOSED;
let fullHeight = 0;
let fullHeightWidth = -1;
let lastInnerHeight = 0;

const NON_TEXT_INPUTS = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "hidden",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);

const takesText = (element: Element | null): boolean =>
  element instanceof HTMLTextAreaElement ||
  (element instanceof HTMLInputElement && !NON_TEXT_INPUTS.has(element.type)) ||
  (element instanceof HTMLElement &&
    (element.isContentEditable ||
      element.matches('[contenteditable]:not([contenteditable="false"])')));

const focusedElement = (): Element | null => {
  let element = document.activeElement;
  while (element?.shadowRoot?.activeElement) {
    element = element.shadowRoot.activeElement;
  }
  return element;
};

const measureFullHeight = () => {
  const shorter = window.innerHeight < lastInnerHeight;
  lastInnerHeight = window.innerHeight;
  if (
    window.innerWidth !== fullHeightWidth ||
    (shorter && !takesText(focusedElement()))
  ) {
    fullHeightWidth = window.innerWidth;
    fullHeight = window.innerHeight;
  } else {
    fullHeight = Math.max(fullHeight, window.innerHeight);
  }
};

export function keyboard(): Keyboard {
  const viewport =
    typeof window === "undefined" ? undefined : window.visualViewport;
  if (!viewport || viewport.scale > 1) {
    return CLOSED;
  }
  if (window.innerWidth !== fullHeightWidth) {
    measureFullHeight();
  }
  const height = Math.max(0, fullHeight - viewport.height);
  return height > KEYBOARD_MIN_HEIGHT ? { open: true, height } : CLOSED;
}

const release = () => {
  document.body.style.height = "";
  document.documentElement.classList.remove(OPEN_CLASS);
};

const fit = () => {
  const viewport = window.visualViewport;
  if (!viewport) {
    return;
  }
  measureFullHeight();
  const next = keyboard();
  if (next.open) {
    document.body.style.height = `${viewport.height}px`;
    document.body.style.setProperty("--keyboard-height", `${next.height}px`);
    document.documentElement.classList.add(OPEN_CLASS);
  } else {
    release();
  }
  if (window.scrollY !== 0 || viewport.offsetTop > 0) {
    window.scrollTo(0, 0);
  }
  if (next.open !== last.open || next.height !== last.height) {
    last = next;
    listeners.forEach((listener) => listener(next));
  }
};

export function fitToKeyboard(
  onChange?: (keyboard: Keyboard) => void,
): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }
  if (onChange) {
    listeners.add(onChange);
  }
  holders += 1;
  if (holders === 1) {
    window.visualViewport?.addEventListener("resize", fit);
    window.visualViewport?.addEventListener("scroll", fit);
    fit();
  }
  let held = true;
  return () => {
    if (!held) {
      return;
    }
    held = false;
    if (onChange) {
      listeners.delete(onChange);
    }
    holders -= 1;
    if (holders === 0) {
      window.visualViewport?.removeEventListener("resize", fit);
      window.visualViewport?.removeEventListener("scroll", fit);
      last = CLOSED;
      release();
    }
  };
}
