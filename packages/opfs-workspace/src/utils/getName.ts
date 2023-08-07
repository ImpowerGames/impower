import { getFileName } from "./getFileName";

export const getName = (relativePath: string) =>
  getFileName(relativePath).split(".")[0]!;
