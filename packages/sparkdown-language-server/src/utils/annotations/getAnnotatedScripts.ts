import { SparkdownAnnotations } from "@impower/sparkdown/src/compiler/classes/SparkdownCombinedAnnotator";
import { type Tree } from "@lezer/common";
import { type AnnotatedScript } from "./getDeclarationScopes";

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
