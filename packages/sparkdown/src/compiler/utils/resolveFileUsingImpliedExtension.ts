export const resolveFileUsingImpliedExtension = (
  rootUri: string,
  relativePath: string,
  ext: string
) => {
  const trimmedPath = relativePath.startsWith("/")
    ? relativePath.slice(1).trim()
    : relativePath.trim();
  const indexOfLastSlash = trimmedPath.lastIndexOf("/");
  const filename = trimmedPath.slice(
    indexOfLastSlash >= 0 ? indexOfLastSlash : 0
  );
  const impliedSuffix = filename.includes(".") ? "" : `.${ext}`;
  const relativePathWithSuffix = trimmedPath + impliedSuffix;
  const uri = new URL("./" + relativePathWithSuffix, rootUri).href;
  return uri;
};
