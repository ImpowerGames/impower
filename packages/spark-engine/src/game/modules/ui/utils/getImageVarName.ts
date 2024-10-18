const INVALID_VAR_NAME_CHAR = /[^_\p{L}0-9]+/gu;

export const getImageVarName = (name: string) => {
  // An image with the same attributes should direct to the same image
  // (no matter the order of the attributes)
  const [tag, ...attributes] = name.split("~");
  const normalizedName = [tag, ...attributes.sort()].join("~");
  return `--image-${normalizedName?.replaceAll(INVALID_VAR_NAME_CHAR, "-")}`;
};
