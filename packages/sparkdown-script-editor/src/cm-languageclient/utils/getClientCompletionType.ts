import { CompletionItemKind } from "vscode-languageserver-protocol";

const COMPLETION_ITEM_KIND_MAP = Object.fromEntries(
  Object.entries(CompletionItemKind).map(([key, value]) => [value, key])
) as Record<CompletionItemKind, string>;

export const getClientCompletionType = (
  kind: CompletionItemKind | undefined
) => {
  return COMPLETION_ITEM_KIND_MAP[
    (kind || "") as CompletionItemKind
  ].toLowerCase();
};
