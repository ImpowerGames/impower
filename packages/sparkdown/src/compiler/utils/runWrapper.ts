// A `run` statement compiles its `.luau` file as a document of its own: the
// file's text wrapped in a function (`& W()`, `function W()`, the text,
// `end`), under the file's URI with this query naming the wrapper. The
// compiler builds the document, the type checker reads the file's text back
// out of it, and the validator treats the wrapper's closing `end` as the end
// of the file.
//
// The compiler splits that document in two (#887): a declaration document
// holds the function alone, once per compile for each file, and each `run`
// statement compiles a call document of its own holding the call.

import { documentTag } from "../lower/utils/documentTag";

export const RUN_QUERY = "?run=";

const RUN_SITE_PARAM = "&site=";

/**
 * The wrapper function of the `.luau` file at `fileUri`: `__run_` and the
 * file's URI spelled as an identifier no other URI shares (`documentTag`).
 * It depends on the file alone, never on the path a `run` writes, the order
 * a compile reaches its `run`s or what earlier compiles saw, so a cold and
 * an incremental compile of one text name it alike and two files never
 * share it.
 */
export function runWrapperFunctionName(fileUri: string): string {
  return `__run_${documentTag(fileUri)}`;
}

/** The call a `run` statement makes to its file's wrapper. */
export function runCallText(wrapper: string): string {
  return `& ${wrapper}()\n`;
}

/** The lines before a `run` file's text. */
export function runWrapperPrefix(wrapper: string): string {
  return `${runCallText(wrapper)}function ${wrapper}()\n`;
}

/** The lines after a `run` file's text; the last is the wrapper's `end`. */
export const RUN_WRAPPER_SUFFIX = "\nend\n";

/** The document a `run` file is compiled as. */
export function runWrapperText(wrapper: string, fileText: string): string {
  return `${runWrapperPrefix(wrapper)}${fileText}${RUN_WRAPPER_SUFFIX}`;
}

/** The declaration document of a `run` file: `runWrapperText` with its
 *  call line left blank, so the file's text keeps its lines. */
export function runDeclarationText(wrapper: string, fileText: string): string {
  return `\nfunction ${wrapper}()\n${fileText}${RUN_WRAPPER_SUFFIX}`;
}

/** The URI of the declaration document. */
export function runWrapperUri(fileUri: string, wrapper: string): string {
  return `${fileUri}${RUN_QUERY}${wrapper}`;
}

/** The URI of the call document of the `run` statement numbered `site`. */
export function runCallUri(
  fileUri: string,
  wrapper: string,
  site: number,
): string {
  return `${runWrapperUri(fileUri, wrapper)}${RUN_SITE_PARAM}${site}`;
}

/** The wrapper a `run` document's URI names (a call document's too), or
 *  undefined for any other. */
export function runWrapperName(uri: string): string | undefined {
  const at = uri.indexOf(RUN_QUERY);
  if (at < 0) return undefined;
  const name = uri.slice(at + RUN_QUERY.length);
  const site = name.indexOf(RUN_SITE_PARAM);
  return site < 0 ? name : name.slice(0, site);
}
