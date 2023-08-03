export const getFileExtension = (uri: string): string => {
  return uri.split("/").slice(-1).join("").split(".")[1]!;
};
