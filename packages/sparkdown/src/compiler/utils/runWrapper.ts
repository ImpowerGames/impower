import type { RunFile } from "../../program/ProgramRoot";
import { documentTag } from "../lower/utils/documentTag";
import { projectPath } from "./projectMembership";

export const RUN_QUERY = "?run=";

export function runWrapperFunctionName(fileUri: string): string {
  return `__run_${documentTag(fileUri)}`;
}

export function runWrapperPrefix(wrapper: string): string {
  return `& ${wrapper}()\nfunction ${wrapper}()\n`;
}

export const RUN_WRAPPER_SUFFIX = "\nend\n";

export function runWrapperText(wrapper: string, fileText: string): string {
  return `${runWrapperPrefix(wrapper)}${fileText}${RUN_WRAPPER_SUFFIX}`;
}

export function runDeclarationText(wrapper: string, fileText: string): string {
  return `\nfunction ${wrapper}()\n${fileText}${RUN_WRAPPER_SUFFIX}`;
}

export function runWrapperUri(fileUri: string, wrapper: string): string {
  return `${fileUri}${RUN_QUERY}${wrapper}`;
}

const withoutExtension = (path: string): string =>
  path.replace(/(?<=[^/])\.[^./]*$/, "");

export function runFileRecord(
  files: ReadonlyMap<string, string>,
  projectRoot: string | undefined,
  asWritten = false,
): Map<string, RunFile> {
  const named = (uri: string) =>
    withoutExtension(
      projectPath(uri.slice(uri.lastIndexOf("/") + 1), asWritten),
    );
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
              projectPath(
                projectRoot && uri.startsWith(projectRoot)
                  ? uri.slice(projectRoot.length)
                  : uri,
                asWritten,
              ),
            )
          : name,
    });
  }
  return labels;
}

export function runWrapperName(uri: string): string | undefined {
  const at = uri.indexOf(RUN_QUERY);
  if (at < 0) return undefined;
  return uri.slice(at + RUN_QUERY.length);
}
