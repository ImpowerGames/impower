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
    if (builtinDefinitions) {
      documents.loadBuiltinDefinitions(builtinDefinitions);
    }
    const optionalDefinitions =
      params?.initializationOptions?.["optionalDefinitions"];
    if (optionalDefinitions) {
      documents.loadOptionalDefinitions(optionalDefinitions);
    }
    const schemaDefinitions =
      params?.initializationOptions?.["schemaDefinitions"];
    if (schemaDefinitions) {
      documents.loadSchemaDefinitions(schemaDefinitions);
    }
    const descriptionDefinitions =
      params?.initializationOptions?.["descriptionDefinitions"];
    if (descriptionDefinitions) {
      documents.loadDescriptionDefinitions(descriptionDefinitions);
    }
    const files = params?.initializationOptions?.["files"];
    if (files) {
      await documents.loadFiles(files);
    }
    documents.parse(documents.getMainScriptUri(), true);
    const program = documents.program;
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
    const program = documents.program;
    return getFoldingRanges(document, program);
  });

  // colorProvider
  connection.onDocumentColor((params) => {
    const uri = params.textDocument.uri;
    const document = documents.get(uri);
    const program = documents.program;
    return getDocumentColors(document, program);
  });
  connection.onColorPresentation((params) => {
    return getColorPresentations(params.color);
  });

  // documentSymbolProvider
  connection.onDocumentSymbol((params) => {
    const uri = params.textDocument.uri;
    const document = documents.get(uri);
    const program = documents.program;
    return getDocumentSymbols(document, program);
  });

  // hoverProvider
  connection.onHover((params) => {
    const uri = params.textDocument.uri;
    const document = documents.get(uri);
    const program = documents.parse(uri);
    return getHover(document, program, params.position);
  });

  // completionProvider
  connection.onCompletion((params) => {
    const uri = params.textDocument.uri;
    const document = documents.get(uri);
    const program = documents.parse(uri);
    const tree = documents.getLatestTree(uri);
    const definitions = {
      builtinDefinitions: documents.builtinDefinitions,
      optionalDefinitions: documents.optionalDefinitions,
      schemaDefinitions: documents.schemaDefinitions,
      descriptionDefinitions: documents.descriptionDefinitions,
    };
    const result = getCompletions(
      document,
      program,
      tree,
      definitions,
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
