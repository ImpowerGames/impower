export const getParentPath = (relativePath: string) =>
  relativePath.split("/").slice(0, -1).join("/");
