import { MarkupContent } from "../../../../spark-editor-protocol/src/types";
import { MARKDOWN_REGEX } from "../constants/MARKDOWN_REGEX";
import { FileSystemReader } from "../types/FileSystemReader";

async function replaceAsync(
  str: string,
  regexp: RegExp,
  replacerFunction: (...args: string[]) => Promise<string>
) {
  const replacements = await Promise.all(
    Array.from(str.matchAll(regexp)).map((match) => replacerFunction(...match))
  );
  let i = 0;
  return str.replace(regexp, () => replacements[i++]!);
}

export const getClientMarkupContent = async (
  content: MarkupContent,
  fileSystemReader: FileSystemReader
) => {
  const kind = content.kind;
  const value = await replaceAsync(
    content.value,
    MARKDOWN_REGEX.image,
    async (_match, $1, $2) => {
      let src: string = $2;
      if (src.startsWith(fileSystemReader.scheme)) {
        const fileSrc = await fileSystemReader.url(src);
        if (fileSrc) {
          src = fileSrc;
        }
      }
      return `![${$1}](${src})`;
    }
  );
  return {
    kind,
    value,
  };
};
