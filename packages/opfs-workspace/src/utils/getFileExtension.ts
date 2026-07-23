// Extension = the segment AFTER THE FINAL dot of the basename. Handles
// multi-dot names (`sprite.idle.001.png` -> `png`) where the old `split(".")[1]`
// returned an interior segment; returns "" when there is no extension.
export const getFileExtension = (uri: string): string => {
  const fileName = uri.split("/").slice(-1).join("");
  const dot = fileName.lastIndexOf(".");
  return dot >= 0 ? fileName.slice(dot + 1) : "";
};
