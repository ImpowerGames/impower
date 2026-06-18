import { getFileName } from "./getFileName";

// Basename with the FINAL extension removed. Preserves interior dots
// (`a.b.c.png` -> `a.b.c`), keeps a no-extension name whole (`README`), and —
// importantly — yields an EMPTY name for a leading-dot dotfile (`.textSynced`
// -> ``) so project metadata dot-files stay unnamed (and excluded from bundles
// / file lists, which gate on a truthy name).
export const getName = (relativePath: string): string => {
  const fileName = getFileName(relativePath);
  const dot = fileName.lastIndexOf(".");
  if (dot <= 0) {
    return dot === 0 ? "" : fileName;
  }
  return fileName.slice(0, dot);
};
