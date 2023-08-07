import { DidParseTextDocumentMessage } from "@impower/spark-editor-protocol/src/protocols/textDocument/DidParseTextDocumentMessage.js";
import type {
  InitializeResult,
  ServerCapabilities,
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
import getColorPresentations from "./utils/getColorPresentations";
import getCompletions from "./utils/getCompletions";
import getDocumentColors from "./utils/getDocumentColors";
import getDocumentDiagnostics from "./utils/getDocumentDiagnostics";
import getDocumentSymbols from "./utils/getDocumentSymbols";
import getFoldingRanges from "./utils/getFoldingRanges";
import getHover from "./utils/getHover";

console.log("running sparkdown-language-server");

try {
  const messageReader = new BrowserMessageReader(self);
  const messageWriter = new BrowserMessageWriter(self);
  const connection = createConnection(messageReader, messageWriter);

  const documents = new SparkdownTextDocuments(TextDocument);

  connection.onInitialize((_params): InitializeResult => {
    const capabilities: ServerCapabilities = {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      foldingRangeProvider: true,
      documentSymbolProvider: true,
      colorProvider: true,
      hoverProvider: true,
      completionProvider: {
        resolveProvider: true,
        triggerCharacters: [".", "\n", "\r", "-", " ", "(", "["],
        completionItem: {
          labelDetailsSupport: true,
        },
      },
    };
    return { capabilities };
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
    connection.sendDiagnostics(
      getDocumentDiagnostics(change.document, change.program)
    );
  });

  // foldingRangeProvider
  connection.onFoldingRanges((params) => {
    const uri = params.textDocument.uri;
    const document = documents.get(uri);
    const program = documents.program(uri);
    return getFoldingRanges(document, program);
  });

  // documentSymbolProvider
  connection.onDocumentSymbol((params) => {
    const uri = params.textDocument.uri;
    const document = documents.get(uri);
    const program = documents.program(uri);
    return getDocumentSymbols(document, program);
  });

  // colorProvider
  connection.onDocumentColor((params) => {
    const uri = params.textDocument.uri;
    const document = documents.get(uri);
    const program = documents.program(uri);
    return getDocumentColors(document, program);
  });
  connection.onColorPresentation((params) => {
    return getColorPresentations(params.color);
  });

  // hoverProvider
  connection.onHover((params) => {
    const uri = params.textDocument.uri;
    const document = documents.get(uri);
    const program = documents.program(uri);
    return getHover(document, program, params.position);
  });

  // completionProvider
  connection.onCompletion((params) => {
    const uri = params.textDocument.uri;
    const document = documents.get(uri);
    const program = documents.program(uri);
    const result = getCompletions(
      document,
      program,
      params.position,
      params.context
    );
    return result;
  });
  connection.onCompletionResolve((item) => {
    return item;
  });

  documents.listen(connection);

  connection.listen();
} catch (e) {
  console.error(e);
}
