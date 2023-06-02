export const setHTMLOverscrollBehavior = (
  document: Document,
  overscrollBehavior: "auto" | "contain"
): void => {
  document.documentElement.style.overscrollBehavior = overscrollBehavior;
};
