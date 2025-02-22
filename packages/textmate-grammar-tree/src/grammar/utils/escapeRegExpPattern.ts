export const escapeRegExpPattern = (pattern: string) => {
  return pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // $& means the whole matched string
};
