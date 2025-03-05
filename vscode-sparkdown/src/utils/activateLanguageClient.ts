import * as vscode from "vscode";
import {
  DidCompileTextDocumentMessage,
  DidCompileTextDocumentParams,
} from "@impower/spark-editor-protocol/src/protocols/textDocument/DidCompileTextDocumentMessage";
import { DEFAULT_BUILTIN_DEFINITIONS } from "@impower/spark-engine/src/game/modules/DEFAULT_BUILTIN_DEFINITIONS";
import { DEFAULT_OPTIONAL_DEFINITIONS } from "@impower/spark-engine/src/game/modules/DEFAULT_OPTIONAL_DEFINITIONS";
import { DEFAULT_SCHEMA_DEFINITIONS } from "@impower/spark-engine/src/game/modules/DEFAULT_SCHEMA_DEFINITIONS";
import { DEFAULT_DESCRIPTION_DEFINITIONS } from "@impower/spark-engine/src/game/modules/DEFAULT_DESCRIPTION_DEFINITIONS";
import { SparkProgramManager } from "../providers/SparkProgramManager";
import { SparkdownStatusBarManager } from "../providers/SparkdownStatusBarManager";
import { createSparkdownLanguageClient } from "./createSparkdownLanguageClient";
import { getEditor } from "./getEditor";
import {
  ExecuteCommandParams,
  ExecuteCommandRequest,
  ExecuteCommandSignature,
  LSPAny,
  ProvideDocumentSymbolsSignature,
} from "vscode-languageclient";
import { SparkdownPreviewGamePanelManager } from "../providers/SparkdownPreviewGamePanelManager";
import { updateCommands } from "./updateCommands";
import { SparkdownOutlineTreeDataProvider } from "../providers/SparkdownOutlineTreeDataProvider";

export const activateLanguageClient = async (
  context: vscode.ExtensionContext
): Promise<void> => {
  const sparkdownConfig = vscode.workspace.getConfiguration("sparkdown");
  const editor = getEditor();
  const scriptFiles = sparkdownConfig["scriptFiles"];
  const imageFiles = sparkdownConfig["imageFiles"];
  const audioFiles = sparkdownConfig["audioFiles"];
  const fontFiles = sparkdownConfig["fontFiles"];
  const workspaceFilePatterns = [
    scriptFiles,
    imageFiles,
    audioFiles,
    fontFiles,
  ].map((pattern) => "**/" + pattern);
  const fileWatchers = workspaceFilePatterns.map((pattern) =>
    vscode.workspace.createFileSystemWatcher(pattern)
  );
  const [scriptFileUris, imageFileUris, audioFileUris, fontFileUrls] =
    await Promise.all(
      workspaceFilePatterns.map((pattern) =>
        vscode.workspace.findFiles(pattern)
      )
    );
  const files = await Promise.all([
    ...(scriptFileUris || []).map(async (fileUri) => {
      const uri = fileUri.toString();
      const buffer = await vscode.workspace.fs.readFile(fileUri);
      const text = Buffer.from(buffer).toString("utf8");
      const result = { uri, text };
      return result;
    }),
    ...(imageFileUris || []).map(async (fileUri) => {
      const uri = fileUri.toString();
      if (uri.endsWith("svg")) {
        const buffer = await vscode.workspace.fs.readFile(fileUri);
        const text = Buffer.from(buffer).toString("utf8");
        const result = { uri, text };
        return result;
      }
      return { uri };
    }),
    ...(audioFileUris || []).map(async (fileUri) => {
      const uri = fileUri.toString();
      return { uri };
    }),
    ...(fontFileUrls || []).map(async (fileUri) => {
      const uri = fileUri.toString();
      return { uri };
    }),
  ]);
  const executeCommandMiddleware = async (params: {
    command: string;
    arguments?: LSPAny[];
  }) => {
    // TODO: handle fetching latest text with workspace/textDocumentContent/refresh instead?
    if (params.command === "sparkdown.readTextDocument") {
      const [uri] = params.arguments || [];
      if (uri && typeof uri === "string") {
        const buffer = await vscode.workspace.fs.readFile(
          vscode.Uri.parse(uri)
        );
        const text = new TextDecoder("utf-8").decode(buffer);
        const result = { uri, text };
        return result;
      }
    }
    return undefined;
  };
  const client = await createSparkdownLanguageClient(context, {
    documentSelector: [{ language: "sparkdown" }],
    synchronize: {
      fileEvents: fileWatchers,
    },
    markdown: {
      isTrusted: true,
      supportHtml: true,
    },
    initializationOptions: {
      settings: { scriptFiles, imageFiles, audioFiles, fontFiles },
      files,
      uri: editor?.document?.uri.toString(),
      builtinDefinitions: DEFAULT_BUILTIN_DEFINITIONS,
      optionalDefinitions: DEFAULT_OPTIONAL_DEFINITIONS,
      schemaDefinitions: DEFAULT_SCHEMA_DEFINITIONS,
      descriptionDefinitions: DEFAULT_DESCRIPTION_DEFINITIONS,
    },
    middleware: {
      provideDocumentSymbols: async (
        document: vscode.TextDocument,
        token: vscode.CancellationToken,
        next: ProvideDocumentSymbolsSignature
      ) => {
        const value = await next(document, token);
        SparkdownOutlineTreeDataProvider.instance.update(document.uri, value);
        return value;
      },
      executeCommand: async (
        command: string,
        args: any[],
        next: ExecuteCommandSignature
      ) => {
        const value = await next(command, args);
        const result = await executeCommandMiddleware({
          command,
          arguments: args,
        });
        if (result !== undefined) {
          return result;
        }
        return value;
      },
    },
  });
  client.onNotification(
    DidCompileTextDocumentMessage.method,
    (params: DidCompileTextDocumentParams) => {
      onParse(context, params);
    }
  );
  client.onRequest(
    ExecuteCommandRequest.method,
    (params: ExecuteCommandParams) => {
      return executeCommandMiddleware(params);
    }
  );
  await client.start();
  context.subscriptions.push({ dispose: () => client.stop() });
};

const onParse = (
  _context: vscode.ExtensionContext,
  params: DidCompileTextDocumentParams
) => {
  const program = params.program;
  const textDocument = params.textDocument;
  const editor = getEditor(textDocument.uri);
  const document = editor?.document;
  if (document) {
    SparkProgramManager.instance.update(document.uri, program);
    SparkdownPreviewGamePanelManager.instance.loadDocument(document);
    updateCommands(document.uri);
    // TODO:
    // SparkdownStatusBarManager.instance.updateStatusBarItem(
    //   program?.metadata?.actionDuration ?? 0,
    //   program?.metadata?.dialogueDuration ?? 0
    // );
  }
};
