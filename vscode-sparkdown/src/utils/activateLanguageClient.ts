import {
  DidParseTextDocumentMessage,
  DidParseTextDocumentParams,
} from "@impower/spark-editor-protocol/src/protocols/textDocument/DidParseTextDocumentMessage";
import { DidWatchFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidWatchFilesMessage";
import * as vscode from "vscode";
import { SparkProgramManager } from "../providers/SparkProgramManager";
import { SparkdownStatusBarManager } from "../providers/SparkdownStatusBarManager";
import { createSparkdownLanguageClient } from "./createSparkdownLanguageClient";
import { getEditor } from "./getEditor";

export const activateLanguageClient = async (
  context: vscode.ExtensionContext
): Promise<void> => {
  const filePattern = "**/assets/**.{sd,svg,png,midi,wav}";
  const fileWatcher = vscode.workspace.createFileSystemWatcher(filePattern);
  const client = await createSparkdownLanguageClient(context, {
    synchronize: {
      fileEvents: fileWatcher,
    },
    markdown: {
      isTrusted: true,
      supportHtml: true,
    },
  });
  client.onNotification(
    DidParseTextDocumentMessage.method,
    (params: DidParseTextDocumentParams) => {
      onParse(context, params);
    }
  );
  await client.start();
  context.subscriptions.push({ dispose: () => client.stop() });
  const fileUris = await vscode.workspace.findFiles(filePattern);
  const files = await Promise.all(
    fileUris.map(async (fileUri) => {
      const uri = fileUri.toString();
      if (uri.endsWith("svg")) {
        const buffer = await vscode.workspace.fs.readFile(fileUri);
        const text = Buffer.from(buffer).toString("utf8");
        const params = { uri, text };
        return params;
      }
      return { uri };
    })
  );
  client.sendNotification(DidWatchFilesMessage.method, {
    files,
  });
};

const onParse = (
  _context: vscode.ExtensionContext,
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
  }
};
