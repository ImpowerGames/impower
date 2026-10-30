export const getFileExtension = (uri: string): string => {
  const fileName = uri.split("/").slice(-1).join("");
  const dot = fileName.lastIndexOf(".");
  return dot >= 0 ? fileName.slice(dot + 1) : "";
};
