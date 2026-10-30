import type { FileData } from "@impower/spark-editor-protocol/src/types";

const FILE_SEPARATOR_PREFIX = "//// ";
const FILE_SEPARATOR_SUFFIX = " ////";

const FILE_SEPARATOR_LINE_SOURCE =
  String.raw`^[ \t]*\/{4,}[ \t]+(.+?)[ \t]+\/{4,}[ \t]*\r?$`;

const cmp = (a: string, b: string) => (a > b ? 1 : a < b ? -1 : 0);

export const bundleScripts = (
  files: FileData[],
  mainRelativePath: string,
  getRelativePath: (uri: string) => string,
): string => {
  const main = files.find((f) => getRelativePath(f.uri) === mainRelativePath);
  let content = "";
  if (main?.text != null) {
    content += `${main.text}`;
  }
  files
    .filter((f) => f !== main && f.text != null && f.name)
    .sort(
      (a, b) =>
        cmp(a.ext, b.ext) ||
        cmp(a.name, b.name) ||
        cmp(getRelativePath(a.uri), getRelativePath(b.uri)),
    )
    .forEach((f) => {
      const relativePath = getRelativePath(f.uri);
      content += `\n\n${FILE_SEPARATOR_PREFIX}${relativePath}${FILE_SEPARATOR_SUFFIX}`;
      content += `\n\n${f.text}`;
    });
  return content.trim();
};

export const splitScriptBundle = (
  text: string,
  mainRelativePath: string,
): Record<string, string> => {
  const separatorLine = new RegExp(FILE_SEPARATOR_LINE_SOURCE, "gm");
  const separators: { path: string; start: number; end: number }[] = [];
  let match: RegExpExecArray | null;
  while ((match = separatorLine.exec(text))) {
    separators.push({
      path: match[1]!.trim(),
      start: match.index,
      end: separatorLine.lastIndex,
    });
  }
  const chunks: Record<string, string> = {};
  let cursor = 0;
  let pathForBody = mainRelativePath;
  for (const separator of separators) {
    chunks[pathForBody] = text.slice(cursor, separator.start).trim();
    pathForBody = separator.path;
    cursor = separator.end;
  }
  chunks[pathForBody] = text.slice(cursor).trim();
  return chunks;
};
