// A `run` statement compiles its `.luau` file as a document of its own: the
// file's text wrapped in a function (`& W()`, `function W()`, the text,
// `end`), under the file's URI with this query naming the wrapper. The
// compiler builds the document, the type checker reads the file's text back
// out of it, and the validator treats the wrapper's closing `end` as the end
// of the file.
//
// The compiler compiles the function alone, in a declaration document, once
// per compile for each file (#887), and each `run` statement is a call of
// the function where its line stands (I-1439).

import type { RunFile } from "../../program/ProgramRoot";
import { documentTag } from "../lower/utils/documentTag";

export const RUN_QUERY = "?run=";

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

/** The lines before a `run` file's text: the call, then the function. */
export function runWrapperPrefix(wrapper: string): string {
  return `& ${wrapper}()\nfunction ${wrapper}()\n`;
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

/** A path of a URI as an author spells it: each escape decoded, or the
 *  path as it is when it holds a malformed one. */
const decodedPath = (path: string): string => {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
};

/** A path without the extension of its last name. */
const withoutExtension = (path: string): string =>
  path.replace(/(?<=[^/])\.[^./]*$/, "");

/**
 * The record of the wrappers of the `run` files a compile ran (`files`, the
 * URI of each by its wrapper's name): each wrapper's file, and the name an
 * author reads the wrapper by, the file's name decoded and without its
 * extension (`my%20helper.luau` shows as `my helper`). Two files of one name
 * are each shown by their paths under the project's folder (`projectRoot`),
 * so `a/helper` and `b/helper` stay apart. The names are only shown: a
 * wrapper's identity stays its name (`runWrapperFunctionName`).
 */
export function runFileRecord(
  files: ReadonlyMap<string, string>,
  projectRoot: string | undefined,
): Map<string, RunFile> {
  const named = (uri: string) =>
    withoutExtension(decodedPath(uri.slice(uri.lastIndexOf("/") + 1)));
  const counts = new Map<string, number>();
  for (const uri of files.values()) {
    const name = named(uri);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const labels = new Map<string, RunFile>();
  for (const [wrapper, uri] of files) {
    const name = named(uri);
    labels.set(wrapper, {
      uri,
      label:
        counts.get(name)! > 1
          ? withoutExtension(
              decodedPath(
                projectRoot && uri.startsWith(projectRoot)
                  ? uri.slice(projectRoot.length)
                  : uri,
              ),
            )
          : name,
    });
  }
  return labels;
}

/** The wrapper a `run` document's URI names, or undefined for any other. */
export function runWrapperName(uri: string): string | undefined {
  const at = uri.indexOf(RUN_QUERY);
  if (at < 0) return undefined;
  return uri.slice(at + RUN_QUERY.length);
}
