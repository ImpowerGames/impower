export const resolveDivertPath = (
  divertPath: string,
  scopePath: string
): string | null => {
  if (divertPath.endsWith(".")) {
    return null;
  }
  const pathParts = divertPath.split(".");
  let resolvedPath: string[] = [];
  for (const part of pathParts) {
    if (part === "") {
      // divertPath starts with dot, so it is a relative path
      resolvedPath.push(...scopePath.split("."));
    } else if (part === "^") {
      // parent
      resolvedPath.pop();
      resolvedPath.push(part);
    } else if (!Number.isNaN(Number(part))) {
      // TODO:
      // for now, paths with numbers are not supported
      return null;
    } else {
      resolvedPath.push(part);
    }
  }
  return resolvedPath.join(".");
};
