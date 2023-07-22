import {
  DidParseTextDocument,
  DidParseTextDocumentParams,
} from "@impower/spark-editor-protocol/src/protocols/textDocument/messages/DidParseTextDocument";
import { ParseTextDocument } from "@impower/spark-editor-protocol/src/protocols/textDocument/messages/ParseTextDocument";
import { SparkProgram } from "@impower/sparkdown/src/types/SparkProgram";
import * as vscode from "vscode";
import { SparkProgramManager } from "../providers/SparkProgramManager";
import { SparkdownStatusBarManager } from "../providers/SparkdownStatusBarManager";
import { createSparkdownLanguageClient } from "./createSparkdownLanguageClient";
import { getEditor } from "./getEditor";
import { updateOutline } from "./updateOutline";

export const activateLanguageClient = async (
  context: vscode.ExtensionContext
): Promise<void> => {
  const client = await createSparkdownLanguageClient(context);
  client.onNotification(
    DidParseTextDocument.method,
    (params: DidParseTextDocumentParams) => {
      onParse(context, params);
    }
  );
  await client.start();
  const dispose = () => client.stop();
  context.subscriptions.push({ dispose });
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      client.sendRequest<SparkProgram>(ParseTextDocument.method, {
        textDocument: { uri: editor?.document.uri.toString() },
      });
    })
  );
};

const onParse = (
  context: vscode.ExtensionContext,
  params: DidParseTextDocumentParams
) => {
  const program = params.program;
  const textDocument = params.textDocument;
  const editor = getEditor(textDocument.uri);
  const document = editor?.document;
  if (document) {
    SparkProgramManager.instance.update(document.uri, program);
    SparkdownStatusBarManager.instance.updateStatusBarItem(
      program?.metadata?.actionDuration ?? 0,
      program?.metadata?.dialogueDuration ?? 0
    );
    updateOutline(context, document);
  }
};
