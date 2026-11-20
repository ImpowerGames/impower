const BACKSLASH = String.fromCharCode(92);

export const storageSegments = (path: string): string[] =>
  path
    .split("/")
    .filter((part) => part && part !== "." && part !== "..")
    .map((part) => part.replaceAll(BACKSLASH, "_"));

export const storageLeaf = (name: string): string =>
  name.replaceAll(BACKSLASH, "_").replaceAll("/", "_");

export const storagePath = (path: string): string =>
  storageSegments(path).join("/");
