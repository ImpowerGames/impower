export type Keyboard = { open: boolean; height: number };

const OPEN_CLASS = "keyboard-open";

const CLOSED: Keyboard = { open: false, height: 0 };

const listeners = new Set<(keyboard: Keyboard) => void>();
let holders = 0;
let last: Keyboard = CLOSED;

export function keyboard(): Keyboard {
  const viewport =
    typeof window === "undefined" ? undefined : window.visualViewport;
  if (!viewport || viewport.scale > 1) {
    return CLOSED;
  }
  const height = Math.max(0, window.innerHeight - viewport.height);
  return height > 0 ? { open: true, height } : CLOSED;
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
