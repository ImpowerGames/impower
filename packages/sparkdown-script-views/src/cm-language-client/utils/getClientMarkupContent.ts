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
  const urls: string[] = [];
  const kind = content.kind;
  const value = await replaceAsync(
    content.value,
    MARKDOWN_REGEX.image,
    async (_match, $1, $2) => {
      let src: string = $2;
      if (src.startsWith(fileSystemReader.scheme)) {
        const buffer = await fileSystemReader.read(src);
        src = URL.createObjectURL(new Blob([buffer]));
        urls.push(src);
      }
      return `![${$1}](${src})`;
    }
  );
  return {
    kind,
    value,
    urls,
  };
};
