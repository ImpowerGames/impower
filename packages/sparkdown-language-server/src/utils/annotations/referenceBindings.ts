import { Reference } from "@impower/sparkdown/src/compiler/classes/annotators/ReferenceAnnotator";
import { LocalBindings } from "@impower/sparkdown/src/compiler/utils/localBinding";
import { SparkdownLanguageServerWorkspace } from "../../classes/SparkdownLanguageServerWorkspace";

export const referenceBindings = (
  workspace: Pick<SparkdownLanguageServerWorkspace, "tree" | "document">,
) => {
  const bindings = new Map<string, LocalBindings | null>();
  return (uri: string, from: number, reference: Reference | undefined): string | undefined => {
    if (!bindings.has(uri)) {
      const tree = workspace.tree(uri);
      const document = workspace.document(uri);
      bindings.set(
        uri,
        tree && document ? new LocalBindings(tree, (a, b) => document.read(a, b)) : null,
      );
    }
    const site = bindings.get(uri)?.bindingOf(from - (reference?.root ?? 0));
    return site == null ? undefined : `${uri}\n${site}`;
  };
};
