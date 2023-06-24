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

import SparkdownTextDocuments from "./classes/SparkdownTextDocuments";
import registerColorProvider from "./providers/registerColorProvider";

console.log("running sparkdown-language-server");

const messageReader = new BrowserMessageReader(self);
const messageWriter = new BrowserMessageWriter(self);
const connection = createConnection(messageReader, messageWriter);

connection.onInitialize((_params: InitializeParams): InitializeResult => {
  const capabilities: ServerCapabilities = {
    colorProvider: true,
  };
  return { capabilities };
});

// Track open, change and close text document events
const documents = new SparkdownTextDocuments(TextDocument);
documents.listen(connection);

// Register feature providers
registerColorProvider(connection, documents);

// Listen on the connection
connection.listen();
