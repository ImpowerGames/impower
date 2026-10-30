import { type SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import {
  getImagePreviewMarkupComposited,
  type ImageCompositeOptions,
} from "@impower/sparkdown/src/compiler/utils/getImageComposite";
import { MarkupKind, type CompletionItem } from "vscode-languageserver";

export interface CompletionItemResolveData {
  uri: string;
  type: string;
  name: string;
  filtered?: { image: string; attributes: string[] };
}

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
