export const lockBodyScrolling = () => {
  document.documentElement.style.setProperty("touch-action", "none");
  document.documentElement.style.setProperty("overflow", "hidden");
  document.documentElement.style.setProperty("position", "fixed");
  document.documentElement.style.setProperty("inset", "0");
  document.documentElement.style.setProperty("overscroll-behavior", "none");

  document.body.style.setProperty("touch-action", "none");
  document.body.style.setProperty("overflow", "hidden");
  document.body.style.setProperty("position", "fixed");
  document.body.style.setProperty("inset", "0");
  document.body.style.setProperty("overscroll-behavior", "none");
};

export const unlockBodyScrolling = () => {
  document.documentElement.style.setProperty("touch-action", null);
  document.documentElement.style.setProperty("overflow", null);
  document.documentElement.style.setProperty("position", null);
  document.documentElement.style.setProperty("inset", null);
  document.documentElement.style.setProperty("overscroll-behavior", null);

  document.body.style.setProperty("touch-action", null);
  document.body.style.setProperty("overflow", null);
  document.body.style.setProperty("position", null);
  document.body.style.setProperty("inset", null);
  document.body.style.setProperty("overscroll-behavior", null);
};
