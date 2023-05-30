export const bezier = (ease: string): string => {
  if (ease === "ease-in-back") {
    return `cubic-bezier(0.36, 0, 0.66, -0.56)`;
  }
  if (ease === "ease-out-back") {
    return `cubic-bezier(0.34, 1.56, 0.64, 1)`;
  }
  if (ease === "ease-in-out-back") {
    return `cubic-bezier(0.68, -0.6, 0.32, 1.6)`;
  }
  if (ease === "ease-standard") {
    return `cubic-bezier(0.4, 0.0, 0.2, 1)`;
  }
  if (ease === "ease-decelerated") {
    return `cubic-bezier(0.0, 0.0, 0.2, 1)`;
  }
  if (ease === "ease-accelerated") {
    return `cubic-bezier(0.4, 0.0, 1, 1)`;
  }
  return ease;
};
