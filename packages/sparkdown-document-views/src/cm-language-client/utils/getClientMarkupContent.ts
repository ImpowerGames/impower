import { MarkupContent } from "@impower/spark-editor-protocol/src/types";
import { MARKDOWN_REGEX } from "../constants/MARKDOWN_REGEX";
import { FileSystemReader } from "../types/FileSystemReader";

function replace(
  str: string,
  regexp: RegExp,
  replacerFunction: (...args: string[]) => string
) {
  const replacements = Array.from(str.matchAll(regexp)).map((match) =>
    replacerFunction(...match)
  );
  let i = 0;
  return str.replace(regexp, () => replacements[i++]!);
}

export const getClientMarkupContent = (
  content: MarkupContent,
  fileSystemReader: FileSystemReader
) => {
  const kind = content.kind;
  let value = content.value;
  value = replace(value, MARKDOWN_REGEX.src, (_match, $1, $2, $3, $4) => {
    let src: string = $3;
    if (src.startsWith(fileSystemReader.scheme)) {
      const fileSrc = fileSystemReader.url(src);
      if (fileSrc) {
        src = fileSrc;
      }
    }
    return `${$1}${$2}${src}${$4}`;
  });
  value = replace(value, MARKDOWN_REGEX.image, (_match, $1, $2) => {
    let src: string = $2;
    if (src.startsWith(fileSystemReader.scheme)) {
      const fileSrc = fileSystemReader.url(src);
      if (fileSrc) {
        src = fileSrc;
      }
    }
    return `![${$1}](${src})`;
  });
  return {
    kind,
    value,
  };
};
