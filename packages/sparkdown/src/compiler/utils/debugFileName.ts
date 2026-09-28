/** The file name a script's debug metadata carries, which a runtime error or
 *  warning names: the last segment of the script's uri, without its
 *  extension. Both story engines name a script by it. */
export const debugFileName = (uri: string): string | null =>
  uri.split("/").at(-1)?.split(".")[0] ?? null;
