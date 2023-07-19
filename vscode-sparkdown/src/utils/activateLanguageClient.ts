import {
  DidParseTextDocument,
  DidParseTextDocumentParams,
} from "@impower/spark-editor-protocol/src/protocols/textDocument/messages/DidParseTextDocument";
import * as vscode from "vscode";
import { SparkProgramManager } from "../providers/SparkProgramManager";
import { SparkdownStatusBarManager } from "../providers/SparkdownStatusBarManager";
import { createSparkdownLanguageClient } from "./createSparkdownLanguageClient";
import { getEditor } from "./getEditor";
import { updateOutline } from "./updateOutline";

export const activateLanguageClient = (
  context: vscode.ExtensionContext
): void => {
  const client = createSparkdownLanguageClient(context);
  client.start();
  const dispose = () => client.stop();
  client.onNotification(
    DidParseTextDocument.type.method,
    (params: DidParseTextDocumentParams) => {
      onParse(context, params);
    }
  );
  context.subscriptions.push({ dispose });
};

const onParse = (
  context: vscode.ExtensionContext,
  params: DidParseTextDocumentParams
) => {
  const program = params.program;
  const textDocument = params.textDocument;
  const editor = getEditor(textDocument.uri);
  const document = editor?.document;
  console.log("PARSED", program);
  if (document) {
    // TODO: load assets from workspace
    // const structs = fileState[document.uri.toString()]?.assets;
    // const program = GameSparkParser.instance.parse(document.getText(), {
    //   augmentations: { structs },
    // });
    SparkProgramManager.instance.update(document.uri, program);
    SparkdownStatusBarManager.instance.updateStatusBarItem(
      program?.metadata?.actionDuration ?? 0,
      program?.metadata?.dialogueDuration ?? 0
    );
    updateOutline(context, document);
  }
};
