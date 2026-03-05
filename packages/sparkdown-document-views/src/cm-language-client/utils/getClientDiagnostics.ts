import { Language } from "@codemirror/language";
import { Diagnostic as ClientDiagnostic } from "@codemirror/lint";
import { EditorState } from "@codemirror/state";
import {
  MarkupKind,
  Diagnostic as ServerDiagnostic,
} from "@impower/spark-editor-protocol/src/types";
import { NodeType } from "@lezer/common";
import { Tag } from "@lezer/highlight";
import { FileSystemReader } from "../types/FileSystemReader";
import { getClientDiagnosticActions } from "./getClientDiagnosticActions";
import { getClientDiagnosticSeverity } from "./getClientDiagnosticSeverity";
import { getClientMarkupContent } from "./getClientMarkupContent";
import { getClientMarkupDom } from "./getClientMarkupDom";
import { positionToOffset } from "./positionToOffset";

export const getClientDiagnostics = (
  state: EditorState,
  diagnostics: ServerDiagnostic[],
  fileSystemReader: FileSystemReader,
  language: Language,
  highlighter: {
    style(tags: readonly Tag[]): string | null;
    scope?(node: NodeType): boolean;
  },
): ClientDiagnostic[] => {
  const result: ClientDiagnostic[] = diagnostics
    .map(
      (d): ClientDiagnostic => ({
        from: positionToOffset(state.doc, d.range.start),
        to: positionToOffset(state.doc, d.range.end),
        severity: getClientDiagnosticSeverity(d.severity),
        message: d.message,
        actions: getClientDiagnosticActions(d.data),
        renderMessage: () => {
          let content = { value: d.message, kind: "markdown" as MarkupKind };
          if (typeof content !== "string") {
            const { value, kind } = getClientMarkupContent(
              content,
              fileSystemReader,
            );
            content = { value, kind };
          }
          const dom = getClientMarkupDom({
            content,
            language,
            highlighter,
          });
          return dom;
        },
      }),
    )
    .filter(({ from, to }) => from != null && to != null && from <= to)
    .sort((a, b) => {
      switch (true) {
        case a.from < b.from:
          return -1;
        case a.from > b.from:
          return 1;
      }
      return 0;
    });
  return result;
};
