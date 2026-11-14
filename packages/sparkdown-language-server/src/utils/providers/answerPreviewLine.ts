import type {
  PreviewLineParams,
  PreviewLineResult,
} from "@impower/spark-editor-protocol/src/protocols/textDocument/PreviewLineMessage";
import type { SparkdownDocument } from "@impower/sparkdown/src/compiler/classes/SparkdownDocument";
import type { LineBeat } from "@impower/sparkdown/src/compiler/types/ProgramAddress";
import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import type { Tree } from "@lezer/common";
import { getPreviewLine } from "./getPreviewLine";

export interface PreviewLineSource {
  getMainScriptUri(uri: string): string | undefined;
  currentProgram(uri: string): Promise<SparkProgram | undefined>;
  previewBeatAt(
    program: SparkProgram,
    uri: string,
    line: number,
  ): Promise<LineBeat | undefined>;
  document(uri: string): SparkdownDocument | undefined;
  tree(uri: string): Tree | undefined;
}

export const answerPreviewLine = async (
  source: PreviewLineSource,
  params: PreviewLineParams,
): Promise<PreviewLineResult> => {
  const uri = params.textDocument.uri;
  const program = await source.currentProgram(source.getMainScriptUri(uri) ?? uri);
  if (!program) {
    return null;
  }
  const beat = await source.previewBeatAt(program, uri, params.line);
  const location = beat?.location;
  const shownUri = location?.uri ?? uri;
  const document = source.document(shownUri);
  const tree = source.tree(shownUri);
  if (!document || !tree) {
    return null;
  }
  return getPreviewLine(
    document,
    tree,
    params.line,
    location ? { line: location.startLine, character: location.startColumn } : null,
  );
};
