export const getValidVariableName = (name: string | undefined) => {
  if (!name) {
    return name;
  }
  const strippedKey = name
    .replace(/([ ])/g, "_")
    .replace(/[^_\p{L}0-9]/gu, "")
    .toLowerCase();
  if (/^[0-9]/.test(strippedKey)) {
    return "_" + strippedKey;
  }
  return strippedKey;
};
