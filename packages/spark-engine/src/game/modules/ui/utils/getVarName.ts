const INVALID_VAR_NAME_CHAR = /[^_\p{L}0-9]+/gu;

export const getVarName = (type: string, name: string) => {
  const [tag, ...attributes] = name.split("~");
  const normalizedName = [tag, ...attributes.sort()].join("~");
  return `--theme-${type}-${normalizedName?.replaceAll(INVALID_VAR_NAME_CHAR, "-")}`;
};
