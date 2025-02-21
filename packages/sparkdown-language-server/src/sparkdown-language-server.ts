import { DidParseTextDocumentMessage } from "@impower/spark-editor-protocol/src/protocols/textDocument/DidParseTextDocumentMessage";
import {
  type InitializeResult,
  type ServerCapabilities,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
  BrowserMessageReader,
  BrowserMessageWriter,
  ConfigurationRequest,
  TextDocumentSyncKind,
  createConnection,
} from "vscode-languageserver/browser";

import SparkdownTextDocuments from "./classes/SparkdownTextDocuments";
import { getColorPresentations } from "./utils/providers/getColorPresentations";
import { getCompletions } from "./utils/providers/getCompletions";
import { getDocumentColors } from "./utils/providers/getDocumentColors";
import { getDocumentDiagnostics } from "./utils/providers/getDocumentDiagnostics";
import { getDocumentSymbols } from "./utils/providers/getDocumentSymbols";
import { getFoldingRanges } from "./utils/providers/getFoldingRanges";
import { getHover } from "./utils/providers/getHover";

console.log("running sparkdown-language-server");

try {
  const messageReader = new BrowserMessageReader(self);
  const messageWriter = new BrowserMessageWriter(self);
  const connection = createConnection(messageReader, messageWriter);

  const documents = new SparkdownTextDocuments(TextDocument);

  connection.onInitialize(async (params): Promise<InitializeResult> => {
    const capabilities: ServerCapabilities = {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      foldingRangeProvider: true,
      documentSymbolProvider: true,
      colorProvider: true,
      hoverProvider: true,
      completionProvider: {
        triggerCharacters: [
          ".",
          ",",
          " ",
          "\n",
          "\r",
          "-",
          "(",
          ")",
          "[",
          "]",
          "<",
          ">",
          "@",
          "$",
          "%",
          "#",
          ":",
          "+",
          "~",
          "-",
          `"`,
          `=`,
        ],
        completionItem: {
          labelDetailsSupport: true,
        },
      },
    };
    const workspaceFolders = params?.workspaceFolders;
    if (workspaceFolders) {
      documents.loadWorkspace(workspaceFolders);
    }
    const settings = params?.initializationOptions?.["settings"];
    if (settings) {
      documents.loadConfiguration(settings);
    }
    const builtinDefinitions =
      params?.initializationOptions?.["builtinDefinitions"];
    const optionalDefinitions =
      params?.initializationOptions?.["optionalDefinitions"];
    const schemaDefinitions =
      params?.initializationOptions?.["schemaDefinitions"];
    const descriptionDefinitions =
      params?.initializationOptions?.["descriptionDefinitions"];
    const files = params?.initializationOptions?.["files"];
    if (files) {
      await documents.loadCompiler({
        builtinDefinitions,
        optionalDefinitions,
        schemaDefinitions,
        descriptionDefinitions,
        files,
      });
    }
    const program = await documents.compile(
      documents.getMainScriptUri(workspaceFolders?.[0]?.uri),
      true
    );
    return { capabilities, program };
  });

  connection.onInitialized(async () => {
    const settings = await connection.sendRequest(ConfigurationRequest.type, {
      items: [{ section: "sparkdown" }],
    });
    documents.loadConfiguration(settings[0]);
  });

  // parseProvider
  documents.onDidParse((change) => {
    connection.sendNotification(DidParseTextDocumentMessage.method, {
      textDocument: {
        uri: change.document.uri,
        version: change.document.version,
      },
      program: change.program,
    });
  });

  // diagnosticsProvider
  documents.onUpdateDiagnostics((change) => {
    connection.sendDiagnostics(
      getDocumentDiagnostics(change.document, change.program)
    );
  });

  // foldingRangeProvider
  connection.onFoldingRanges((params) => {
    const uri = params.textDocument.uri;
    const document = documents.get(uri);
    const program = documents.getLatestProgram(uri);
    return getFoldingRanges(document, program);
  });

  // colorProvider
  connection.onDocumentColor((params) => {
    const uri = params.textDocument.uri;
    const document = documents.get(uri);
    const program = documents.getLatestProgram(uri);
    return getDocumentColors(document, program);
  });
  connection.onColorPresentation((params) => {
    return getColorPresentations(params.color);
  });

  // documentSymbolProvider
  connection.onDocumentSymbol((params) => {
    const uri = params.textDocument.uri;
    const document = documents.get(uri);
    const program = documents.getLatestProgram(uri);
    return getDocumentSymbols(document, program);
  });

  // hoverProvider
  connection.onHover((params) => {
    const uri = params.textDocument.uri;
    const document = documents.get(uri);
    const program = documents.getLatestProgram(uri);
    return getHover(document, program, params.position);
  });

  // completionProvider
  connection.onCompletion((params) => {
    const uri = params.textDocument.uri;
    const document = documents.get(uri);
    const tree = documents.getLatestSyntaxTree(uri);
    const program = documents.getLatestProgram(uri);
    const result = getCompletions(
      document,
      tree,
      program,
      documents.compilerConfig,
      params.position,
      params.context
    );
    return result;
  });

  documents.listen(connection);

  connection.listen();
} catch (e) {
  console.error(e);
}
