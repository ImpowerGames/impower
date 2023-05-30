export const getFileName = (path: string): string => {
  const basePath = path.slice(0, path.lastIndexOf("."));
  const fileName = basePath.slice(basePath.lastIndexOf("\\") + 1);
  return fileName;
};
