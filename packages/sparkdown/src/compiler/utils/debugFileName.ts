export const debugFileName = (uri: string): string | null =>
  uri.split("/").at(-1)?.split(".")[0] ?? null;
