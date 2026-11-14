import type {
  PreviewLineParams,
  PreviewLineResult,
} from "@impower/spark-editor-protocol/src/protocols/textDocument/PreviewLineMessage";
import type { SparkdownDocument } from "@impower/sparkdown/src/compiler/classes/SparkdownDocument";
import type { Tree } from "@lezer/common";
import { getPreviewLine } from "./getPreviewLine";

export interface PreviewLineSource {
  document(uri: string): SparkdownDocument | undefined;
  tree(uri: string): Tree | undefined;
}

export const answerPreviewLine = (
  source: PreviewLineSource,
  params: PreviewLineParams,
): PreviewLineResult => {
  const shown = params.shownBeat ?? null;
  const uri = shown?.uri ?? params.textDocument.uri;
  const document = source.document(uri);
  const tree = source.tree(uri);
  if (!document || !tree) {
    return null;
  }
  return getPreviewLine(
    document,
    tree,
    params.line,
    shown
      ? { line: shown.range.start.line, character: shown.range.start.character }
      : null,
  );
};
