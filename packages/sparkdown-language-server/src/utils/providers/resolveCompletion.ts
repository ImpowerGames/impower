import { type SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { getImagePreviewMarkupComposited } from "@impower/sparkdown/src/compiler/utils/getImageComposite";
import { MarkupKind, type CompletionItem } from "vscode-languageserver";

/**
 * What `textDocument/completion` stashes on an asset item so
 * `completionItem/resolve` can find the struct again without re-running the
 * whole completion pass. Kept to plain data — it round-trips through the
 * client untouched.
 */
export interface CompletionItemResolveData {
  /** Document the completion was requested for; identifies the program. */
  uri: string;
  /** Context type + name of the struct to preview. */
  type: string;
  name: string;
}

/**
 * Fill in the expensive half of a completion item.
 *
 * Asset previews are deliberately NOT computed in `textDocument/completion`: a
 * project-wide asset list runs to hundreds of items and the user only ever
 * looks at the highlighted one. Resolving on demand keeps the cost proportional
 * to what is actually shown, which also leaves room for the preview to become
 * genuinely expensive later (see #292 — compositing layered images).
 */
export const resolveCompletion = async (
  item: CompletionItem,
  program: SparkProgram | undefined,
): Promise<CompletionItem> => {
  const data = item.data as CompletionItemResolveData | undefined;
  if (!data || item.documentation != null) {
    return item;
  }
  const struct = program?.context?.[data.type]?.[data.name];
  if (!struct) {
    return item;
  }
  const preview = await getImagePreviewMarkupComposited(
    program?.context,
    struct,
  );
  if (!preview) {
    return item;
  }
  return {
    ...item,
    documentation: { kind: MarkupKind.Markdown, value: preview },
  };
};
