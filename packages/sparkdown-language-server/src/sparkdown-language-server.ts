import type {
  InitializeParams,
  InitializeResult,
  ServerCapabilities,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
  BrowserMessageReader,
  BrowserMessageWriter,
  createConnection,
} from "vscode-languageserver/browser";

import {
  DidParseParams,
  DidParseTextDocument,
} from "./classes/DidParseTextDocument";
import SparkdownTextDocuments from "./classes/SparkdownTextDocuments";
import getColorPresentations from "./utils/getColorPresentations";
import getDocumentColors from "./utils/getDocumentColors";
import getDocumentDiagnostics from "./utils/getDocumentDiagnostics";
import getFoldingRanges from "./utils/getFoldingRanges";

console.log("running sparkdown-language-server");

const messageReader = new BrowserMessageReader(self);
const messageWriter = new BrowserMessageWriter(self);
const connection = createConnection(messageReader, messageWriter);

connection.onInitialize((_params: InitializeParams): InitializeResult => {
  const capabilities: ServerCapabilities = {
    foldingRangeProvider: true,
    colorProvider: true,
  };
  return { capabilities };
});

const documents = new SparkdownTextDocuments(TextDocument);

// parseProvider
documents.onDidParse((change) => {
  const params: DidParseParams = {
    uri: change.document.uri,
    version: change.document.version,
    program: change.program,
  };
  connection.sendNotification(DidParseTextDocument.method, params);
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

documents.listen(connection);

connection.listen();
