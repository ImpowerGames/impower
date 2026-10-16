// A `run` statement compiles its `.luau` file as a document of its own: the
// file's text wrapped in a function (`& W()`, `function W()`, the text,
// `end`), under the file's URI with this query naming the wrapper. The
// compiler builds the document, the type checker reads the file's text back
// out of it, and the validator treats the wrapper's closing `end` as the end
// of the file.

export const RUN_QUERY = "?run=";

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

/** The URI of that document. */
export function runWrapperUri(fileUri: string, wrapper: string): string {
  return `${fileUri}${RUN_QUERY}${wrapper}`;
}

const RUN_SITE_PARAM = "&site=";

/**
 * The URI of the document a later `run` naming the same wrapper in one
 * compile is compiled as: only the call (`runCallText`), the `site`-th of
 * the `run` statements naming it that the compile reaches. The wrapper is
 * declared once, where the first one is.
 */
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
