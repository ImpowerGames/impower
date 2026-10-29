export const escapeRegExpPattern = (pattern: string) => {
  return pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};
