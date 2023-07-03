import { Completion, CompletionInfo } from "@codemirror/autocomplete";
import { Language } from "@codemirror/language";
import { NodeType } from "@lezer/common";
import { Tag } from "@lezer/highlight";
import { MarkupContent, MarkupKind } from "vscode-languageserver-protocol";
import { getMarkdownHtml } from "./getMarkdownHtml";

const createNode = (
  detail: string,
  documentation: string,
  documentationKind: MarkupKind,
  language: Language,
  highlighter: {
    style(tags: readonly Tag[]): string | null;
    scope?(node: NodeType): boolean;
  }
): Node => {
  const preview = document.createElement("div");
  if (detail) {
    const detailNode = document.createElement("div");
    detailNode.textContent = detail;
    detailNode.style.opacity = "0.7";
    detailNode.style.padding = "4px 0 12px 0";
    preview.appendChild(detailNode);
  }
  if (documentation) {
    const documentationNode = document.createElement("div");
    if (documentationKind === "markdown") {
      documentationNode.innerHTML = getMarkdownHtml(
        documentation,
        language,
        highlighter
      );
    } else {
      documentationNode.textContent = documentation;
    }
    documentationNode.style.padding = "2px 0";
    preview.appendChild(documentationNode);
  }
  return preview;
};

const infoContent = (
  detail: string,
  documentation: string,
  documentationKind: MarkupKind,
  language: Language,
  highlighter: {
    style(tags: readonly Tag[]): string | null;
    scope?(node: NodeType): boolean;
  }
): Node => {
  return createNode(
    detail,
    documentation,
    documentationKind,
    language,
    highlighter
  );
};

export const getClientCompletionInfo = (
  detail: string | undefined,
  documentation: string | MarkupContent,
  language: Language,
  highlighter: {
    style(tags: readonly Tag[]): string | null;
    scope?(node: NodeType): boolean;
  }
):
  | string
  | ((completion: Completion) => CompletionInfo | Promise<CompletionInfo>) => {
  const detailValue = detail ?? "";
  const documentationValue =
    typeof documentation === "string" ? documentation : documentation.value;
  const documentationKind =
    typeof documentation === "string" ? "plaintext" : documentation.kind;
  return () =>
    infoContent(
      detailValue,
      documentationValue,
      documentationKind,
      language,
      highlighter
    );
};
