import { DEFAULT_BUILTIN_DEFINITIONS } from "@impower/spark-engine/src/game/modules/DEFAULT_BUILTIN_DEFINITIONS";
import { DEFAULT_DESCRIPTION_DEFINITIONS } from "@impower/spark-engine/src/game/modules/DEFAULT_DESCRIPTION_DEFINITIONS";
import { DEFAULT_OPTIONAL_DEFINITIONS } from "@impower/spark-engine/src/game/modules/DEFAULT_OPTIONAL_DEFINITIONS";
import { DEFAULT_SCHEMA_DEFINITIONS } from "@impower/spark-engine/src/game/modules/DEFAULT_SCHEMA_DEFINITIONS";
import {
  CompiledProgramMessage,
  CompiledProgramParams,
} from "@impower/sparkdown/src/compiler/classes/messages/CompiledProgramMessage";
import * as vscode from "vscode";
import {
  ExecuteCommandParams,
  ExecuteCommandRequest,
  ExecuteCommandSignature,
  LSPAny,
  ProvideDocumentSymbolsSignature,
} from "vscode-languageclient";
import { SparkProgramManager } from "../managers/SparkProgramManager";
import { SparkdownOutlineTreeDataProvider } from "../providers/SparkdownOutlineTreeDataProvider";
import { createSparkdownLanguageClient } from "./createSparkdownLanguageClient";
import { executeLanguageCommand } from "./executeLanguageCommand";
import { getEditor } from "./getEditor";
import { getOpenTextDocument } from "./getOpenTextDocument";
import { getWorkspaceFiles } from "./getWorkspaceFiles";
import { getWorkspaceFileWatchers } from "./getWorkspaceFileWatchers";
import { updateCommands } from "./updateCommands";

export const activateLanguageClient = async (
  context: vscode.ExtensionContext,
): Promise<void> => {
  const sparkdownConfig = vscode.workspace.getConfiguration("sparkdown");
  const editor = getEditor();
  const fileWatchers = getWorkspaceFileWatchers();
  const files = await getWorkspaceFiles();
  for (const file of files) {
    file.src = await executeLanguageCommand({
      command: "sparkdown.getFileSrc",
      arguments: [file.uri],
    });
  }
  const executeCommandMiddleware = async (params: {
    command: string;
    arguments?: LSPAny[];
  }) => {
    const result = await executeLanguageCommand(params);
    if (result !== undefined) {
      return result;
    }
    console.error("UNHANDLED EXECUTE COMMAND:", params);
    return null;
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
      // We have to pre-stringify and parse settings, for some reason, or else the worker errors out
      settings: JSON.parse(JSON.stringify(sparkdownConfig)),
      files,
      definitions: {
        builtins: DEFAULT_BUILTIN_DEFINITIONS,
        optionals: DEFAULT_OPTIONAL_DEFINITIONS,
        schemas: DEFAULT_SCHEMA_DEFINITIONS,
        descriptions: DEFAULT_DESCRIPTION_DEFINITIONS,
      },
      uri: editor?.document?.uri.toString(),
      omitImageData: true,
    },
    middleware: {
      provideDocumentSymbols: async (
        document: vscode.TextDocument,
        token: vscode.CancellationToken,
        next: ProvideDocumentSymbolsSignature,
      ) => {
        const value = await next(document, token);
        SparkdownOutlineTreeDataProvider.instance.update(document.uri, value);
        return value;
      },
      executeCommand: async (
        command: string,
        args: any[],
        next: ExecuteCommandSignature,
      ) => {
        const result = await executeCommandMiddleware({
          command,
          arguments: args,
        });
        if (result !== undefined) {
          return result;
        }
        const value = await next(command, args);
        return value;
      },
    },
  });
  client.onNotification(
    CompiledProgramMessage.method,
    (params: CompiledProgramParams) => {
      onCompile(context, params);
    },
  );
  client.onRequest(
    ExecuteCommandRequest.method,
    (params: ExecuteCommandParams) => {
      return executeCommandMiddleware(params);
    },
  );
  SparkProgramManager.instance.bindLanguageClient(client);
  await client.start();
  context.subscriptions.push({ dispose: () => client.stop() });
};

const onCompile = async (
  _context: vscode.ExtensionContext,
  params: CompiledProgramParams,
) => {
  const program = params.program;
  const textDocument = params.textDocument;
  const document = await getOpenTextDocument(
    vscode.Uri.parse(textDocument.uri),
  );
  if (document) {
    SparkProgramManager.instance.update(document.uri, program);
    updateCommands(document.uri);
    // TODO:
    // SparkdownStatusBarManager.instance.updateStatusBarItem(
    //   program?.metadata?.actionDuration ?? 0,
    //   program?.metadata?.dialogueDuration ?? 0
    // );
  }
};
