import { getFileName } from "./getFileName";

export const getName = (relativePath: string): string => {
  const fileName = getFileName(relativePath);
  const dot = fileName.lastIndexOf(".");
  if (dot <= 0) {
    return dot === 0 ? "" : fileName;
  }
  return fileName.slice(0, dot);
};
