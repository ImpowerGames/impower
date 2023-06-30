const lock = (el: HTMLElement) => {
  el.style.setProperty("touch-action", "none");
  el.style.setProperty("overflow", "hidden");
  el.style.setProperty("position", "fixed");
  el.style.setProperty("inset", "0");
  el.style.setProperty("overscroll-behavior", "none");
};

const unlock = (el: HTMLElement) => {
  el.style.setProperty("touch-action", null);
  el.style.setProperty("overflow", null);
  el.style.setProperty("position", null);
  el.style.setProperty("inset", null);
  el.style.setProperty("overscroll-behavior", null);
};

export const lockBodyScrolling = () => {
  lock(document.documentElement);
  lock(document.body);
};

export const unlockBodyScrolling = () => {
  unlock(document.documentElement);
  unlock(document.body);
};
