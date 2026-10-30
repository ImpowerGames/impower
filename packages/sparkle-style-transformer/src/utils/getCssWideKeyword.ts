const CSS_WIDE_KEYWORDS = new Set([
  "initial",
  "inherit",
  "unset",
  "revert",
  "revert-layer",
]);

export const getCssWideKeyword = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const keyword = value.trim().toLowerCase();
  return CSS_WIDE_KEYWORDS.has(keyword) ? keyword : null;
};
