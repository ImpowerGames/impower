export const getCssPropertyName = (key: string): string => {
  if (key.startsWith("--")) {
    return key;
  }
  const name = key
    .replace(/(\p{Ll}(?=\p{Lu}))/gu, "$1-")
    .replace(/_/g, "-")
    .toLowerCase();
  if (name.startsWith("webkit-")) {
    return `-${name}`;
  }
  return name;
};
