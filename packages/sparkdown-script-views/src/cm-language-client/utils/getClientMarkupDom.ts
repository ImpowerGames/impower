import { Language } from "@codemirror/language";
import { NodeType } from "@lezer/common";
import { Tag } from "@lezer/highlight";
import { MarkupContent, MarkupKind } from "vscode-languageserver-protocol";
import { getMarkdownHtml } from "./getMarkdownHtml";

const createNode = (
  detail: string,
  content: string,
  contentKind: MarkupKind,
  language: Language,
  highlighter: {
    style(tags: readonly Tag[]): string | null;
    scope?(node: NodeType): boolean;
  }
): HTMLElement => {
  const preview = document.createElement("div");
  if (detail) {
    const detailNode = document.createElement("div");
    detailNode.textContent = detail;
    detailNode.style.opacity = "0.7";
    detailNode.style.padding = "4px 0 12px 0";
    preview.appendChild(detailNode);
  }
  if (content) {
    const documentationNode = document.createElement("div");
    if (contentKind === "markdown") {
      documentationNode.innerHTML = getMarkdownHtml(
        content,
        language,
        highlighter
      );
    } else {
      documentationNode.textContent = content;
    }
    documentationNode.style.padding = "2px 0";
    preview.appendChild(documentationNode);
  }
  return preview;
};

export const getClientMarkupDom = (options: {
  detail?: string | undefined;
  content?: string | MarkupContent;
  language: Language;
  highlighter: {
    style(tags: readonly Tag[]): string | null;
    scope?(node: NodeType): boolean;
  };
}) => {
  const detailValue = options?.detail ?? "";
  const documentationValue =
    typeof options?.content === "string"
      ? options?.content
      : options?.content?.value ?? "";
  const documentationKind =
    typeof options?.content === "string"
      ? "plaintext"
      : options?.content?.kind ?? "plaintext";
  return createNode(
    detailValue,
    documentationValue,
    documentationKind,
    options?.language,
    options?.highlighter
  );
};
