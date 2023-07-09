import type {
  CompletionItem,
  CompletionParams,
  InitializeParams,
  InitializeResult,
  ServerCapabilities,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
  BrowserMessageReader,
  BrowserMessageWriter,
  TextDocumentSyncKind,
  createConnection,
} from "vscode-languageserver/browser";

import {
  DidParseTextDocument,
  DidParseTextDocumentParams,
} from "./classes/DidParseTextDocument";
import SparkdownTextDocuments from "./classes/SparkdownTextDocuments";
import getColorPresentations from "./utils/getColorPresentations";
import getCompletions from "./utils/getCompletions";
import getDocumentColors from "./utils/getDocumentColors";
import getDocumentDiagnostics from "./utils/getDocumentDiagnostics";
import getFoldingRanges from "./utils/getFoldingRanges";

console.log("running sparkdown-language-server");

try {
  const messageReader = new BrowserMessageReader(self);
  const messageWriter = new BrowserMessageWriter(self);
  const connection = createConnection(messageReader, messageWriter);

  connection.onInitialize((_params: InitializeParams): InitializeResult => {
    const capabilities: ServerCapabilities = {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      foldingRangeProvider: true,
      colorProvider: true,
      completionProvider: {
        resolveProvider: true,
        triggerCharacters: [".", "\n", "\r", "-", " "],
        completionItem: {
          labelDetailsSupport: true,
        },
      },
    };
    return { capabilities };
  });

  const documents = new SparkdownTextDocuments(TextDocument);

  // parseProvider
  documents.onDidParse((change) => {
    const params: DidParseTextDocumentParams = {
      textDocument: {
        uri: change.document.uri,
        version: change.document.version,
      },
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

  // completionProvider
  connection.onCompletion((params: CompletionParams): CompletionItem[] => {
    const uri = params.textDocument.uri;
    const document = documents.get(uri);
    const program = documents.program(uri);
    return getCompletions(document, program, params.position, params.context);
  });
  connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
    return item;
  });

  documents.listen(connection);

  connection.listen();
} catch (e) {
  console.error(e);
}
