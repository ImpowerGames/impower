export const resolveDivertPath = (
  divertPath: string,
  scopePath: string,
): string | null => {
  if (divertPath.endsWith(".")) {
    return null;
  }
  const pathParts = divertPath.split(".");
  let resolvedPath: string[] = [];
  for (const part of pathParts) {
    if (part === "") {
      resolvedPath.push(...scopePath.split("."));
    } else if (part === "^") {
      resolvedPath.pop();
      resolvedPath.push(part);
    } else if (!Number.isNaN(Number(part))) {
      return null;
    } else {
      resolvedPath.push(part);
    }
  }
  return resolvedPath.join(".");
};
