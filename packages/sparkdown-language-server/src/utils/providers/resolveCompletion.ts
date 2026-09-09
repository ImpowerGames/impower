import { type SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import {
  getImagePreviewMarkupComposited,
  type ImageCompositeOptions,
} from "@impower/sparkdown/src/compiler/utils/getImageComposite";
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
  /**
   * Preview the directive's image with this candidate inserted at the cursor.
   * Ordered attributes include those before and after the replaced token.
   */
  filtered?: { image: string; attributes: string[] };
}

/**
 * Build a candidate in a private context so an unaccepted completion never
 * becomes a declaration. Preserve order in the same canonical key as the
 * compiler: a later attribute in one group overrides an earlier attribute.
 */
const synthesizeFilteredImage = (
  context: { [type: string]: { [name: string]: any } } | undefined,
  filtered: { image: string; attributes: string[] },
):
  | { context: { [type: string]: { [name: string]: any } }; struct: any }
  | undefined => {
  if (!context || !filtered.image) {
    return undefined;
  }
  const attributes = [...filtered.attributes];
  const name = [filtered.image, ...attributes].join("~");
  const existing = context["filtered_image"]?.[name];
  if (existing) {
    return { context, struct: existing };
  }
  const struct = {
    $type: "filtered_image",
    $name: name,
    image: { $name: filtered.image },
    attributes,
  };
  return {
    context: {
      ...context,
      filtered_image: { ...context["filtered_image"], [name]: struct },
    },
    struct,
  };
};

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
  options?: ImageCompositeOptions,
): Promise<CompletionItem> => {
  const data = item.data as CompletionItemResolveData | undefined;
  if (!data || item.documentation != null) {
    return item;
  }
  const synthesized = data.filtered
    ? synthesizeFilteredImage(program?.context, data.filtered)
    : undefined;
  if (data.filtered && !synthesized) {
    return item;
  }
  const context = synthesized ? synthesized.context : program?.context;
  const struct = synthesized
    ? synthesized.struct
    : program?.context?.[data.type]?.[data.name];
  if (!struct) {
    return item;
  }
  const preview = await getImagePreviewMarkupComposited(
    context,
    struct,
    options,
  );
  if (!preview) {
    return item;
  }
  return {
    ...item,
    documentation: { kind: MarkupKind.Markdown, value: preview },
  };
};
