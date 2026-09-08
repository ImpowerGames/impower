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
   * Set on a `~filter` candidate, whose preview is not the filter struct
   * itself but the asset command's image with a whole chain applied: the
   * filters already written in the directive plus this candidate. The chain is
   * carried here because nothing in the compiled program describes a candidate
   * the author has not typed yet.
   */
  filtered?: { image: string; filters: string[] };
}

/**
 * Build the `filtered_image` a `~filter` candidate previews as, in a context
 * the compiled program never sees.
 *
 * The struct has to be registered under its own `$name`: `filterImage` reads a
 * filtered_image's filter list back out of the context by name, so an
 * unregistered struct filters to nothing and the preview shows the unfiltered
 * asset. Registering it in a shallow copy keeps a candidate the author may
 * never accept from being declared in the program — `populateImplicitDefs`
 * declares the real struct once the reference is actually typed.
 *
 * Filter names are sorted, as `populateImplicitDefs` sorts them, so a
 * combination already written elsewhere in the project resolves to that struct
 * and reuses its computed `filtered_src` rather than recomputing it.
 */
const synthesizeFilteredImage = (
  context: { [type: string]: { [name: string]: any } } | undefined,
  filtered: { image: string; filters: string[] },
):
  | { context: { [type: string]: { [name: string]: any } }; struct: any }
  | undefined => {
  if (!context || !filtered.image) {
    return undefined;
  }
  const filters = [...new Set(filtered.filters)].sort();
  const name = [filtered.image, ...filters].join("~");
  const existing = context["filtered_image"]?.[name];
  if (existing) {
    return { context, struct: existing };
  }
  const struct = {
    $type: "filtered_image",
    $name: name,
    image: { $name: filtered.image },
    filters: filters.map((filterName) => ({
      $type: "filter",
      $name: filterName,
    })),
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
