export const getFileName = (relativePath: string) =>
  relativePath.split("/").slice(-1).join("/");
