export const setHTMLBackgroundColor = (
  document: Document,
  backgroundColor: string
): void => {
  document.documentElement.style.backgroundColor = backgroundColor;
};
