import { SparkdownAnnotations } from "@impower/sparkdown/src/compiler/classes/SparkdownCombinedAnnotator";
import { type Tree } from "@lezer/common";
import { type AnnotatedScript } from "./getDeclarationScopes";

/**
 * The scripts a request from `uri` can see, each paired with its syntax tree
 * and a reader over its own text: every script of the compiled program, or
 * `uri` alone before the first compile. A script with no open document is
 * left out, because there is no text to read its annotation ranges from.
 */
export const getAnnotatedScripts = (
  uri: string,
  programScripts: Record<string, unknown> | undefined,
  workspace: {
    document(uri: string): { read(from: number, to: number): string } | undefined;
    annotations(uri: string): SparkdownAnnotations;
    tree(uri: string): Tree | undefined;
  },
): Map<string, AnnotatedScript> => {
  const scriptUris = programScripts ? Object.keys(programScripts) : [uri];
  const scripts = new Map<string, AnnotatedScript>();
  for (const scriptUri of scriptUris) {
    const document = workspace.document(scriptUri);
    if (document) {
      scripts.set(scriptUri, {
        annotations: workspace.annotations(scriptUri),
        tree: workspace.tree(scriptUri),
        read: (from, to) => document.read(from, to),
      });
    }
  }
  return scripts;
};
