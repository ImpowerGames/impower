import {
  type InitializeResult,
  type ServerCapabilities,
} from "vscode-languageserver";
import {
  BrowserMessageReader,
  BrowserMessageWriter,
  TextDocumentSyncKind,
  createConnection,
} from "vscode-languageserver/browser";

import SparkdownTextDocuments from "./classes/SparkdownTextDocuments";
import { getColorPresentations } from "./utils/providers/getColorPresentations";
import { getCompletions } from "./utils/providers/getCompletions";
import { getDocumentColors } from "./utils/providers/getDocumentColors";
import { getDocumentSymbols } from "./utils/providers/getDocumentSymbols";
import { getFoldingRanges } from "./utils/providers/getFoldingRanges";
import { getHover } from "./utils/providers/getHover";
import { SparkdownAnnotations } from "@impower/sparkdown/src/classes/SparkdownCombinedAnnotator";

console.log("running sparkdown-language-server");

try {
  const messageReader = new BrowserMessageReader(self);
  const messageWriter = new BrowserMessageWriter(self);
  const connection = createConnection(messageReader, messageWriter);

  const documents = new SparkdownTextDocuments();

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
    await documents.loadCompiler({
      builtinDefinitions,
      optionalDefinitions,
      schemaDefinitions,
      descriptionDefinitions,
      files,
    });
    const uri = params?.initializationOptions?.["uri"];
    if (uri) {
      const program = await documents.compile(uri);
      return { capabilities, program };
    }
    return { capabilities };
  });

  connection.onInitialized(async () => {
    const settings = await connection.workspace.getConfiguration("sparkdown");
    documents.loadConfiguration(settings[0]);
  });

  // foldingRangeProvider
  connection.onFoldingRanges((params) => {
    const uri = params.textDocument.uri;
    const document = documents.get(uri);
    const program = documents.program(uri);
    performance.mark(`lsp: onFoldingRanges ${uri} start`);
    const result = getFoldingRanges(document, program);
    performance.mark(`lsp: onFoldingRanges ${uri} end`);
    performance.measure(
      `lsp: onFoldingRanges ${uri}`,
      `lsp: onFoldingRanges ${uri} start`,
      `lsp: onFoldingRanges ${uri} end`
    );
    return result;
  });

  // colorProvider
  connection.onDocumentColor((params) => {
    const uri = params.textDocument.uri;
    const document = documents.get(uri);
    const annotations = documents.annotations(uri);
    performance.mark(`lsp: onDocumentColor ${uri} start`);
    const result = getDocumentColors(document, annotations);
    performance.mark(`lsp: onDocumentColor ${uri} end`);
    performance.measure(
      `lsp: onDocumentColor ${uri}`,
      `lsp: onDocumentColor ${uri} start`,
      `lsp: onDocumentColor ${uri} end`
    );
    return result;
  });
  connection.onColorPresentation((params) => {
    performance.mark(`lsp: onDocumentColor start`);
    const result = getColorPresentations(params.color);
    performance.mark(`lsp: onDocumentColor end`);
    performance.measure(
      `lsp: onDocumentColor`,
      `lsp: onDocumentColor start`,
      `lsp: onDocumentColor end`
    );
    return result;
  });

  // documentSymbolProvider
  connection.onDocumentSymbol((params) => {
    const uri = params.textDocument.uri;
    const document = documents.get(uri);
    const program = documents.program(uri);
    performance.mark(`lsp: onDocumentSymbol ${uri} start`);
    const result = getDocumentSymbols(document, program);
    performance.mark(`lsp: onDocumentSymbol ${uri} end`);
    performance.measure(
      `lsp: onDocumentSymbol ${uri}`,
      `lsp: onDocumentSymbol ${uri} start`,
      `lsp: onDocumentSymbol ${uri} end`
    );
    return result;
  });

  // hoverProvider
  connection.onHover((params) => {
    const uri = params.textDocument.uri;
    const document = documents.get(uri);
    const annotations = documents.annotations(uri);
    const program = documents.program(uri);
    const config = documents.compilerConfig;
    performance.mark(`lsp: onHover ${uri} start`);
    const result = getHover(
      document,
      annotations,
      program,
      config,
      params.position
    );
    performance.mark(`lsp: onHover ${uri} end`);
    performance.measure(
      `lsp: onHover ${uri}`,
      `lsp: onHover ${uri} start`,
      `lsp: onHover ${uri} end`
    );
    return result;
  });

  // completionProvider
  connection.onCompletion((params) => {
    const uri = params.textDocument.uri;
    const document = documents.get(uri);
    const tree = documents.tree(uri);
    const program = documents.program(uri);
    const config = documents.compilerConfig;
    const scripts = program?.scripts || [uri];
    const scriptAnnotations: Record<string, SparkdownAnnotations> = {};
    for (const uri of scripts) {
      scriptAnnotations[uri] = documents.annotations(uri);
    }
    performance.mark(`lsp: onCompletion ${uri} start`);
    const result = getCompletions(
      document,
      tree,
      scriptAnnotations,
      program,
      config,
      params.position,
      params.context
    );
    performance.mark(`lsp: onCompletion ${uri} end`);
    performance.measure(
      `lsp: onCompletion ${uri}`,
      `lsp: onCompletion ${uri} start`,
      `lsp: onCompletion ${uri} end`
    );
    return result;
  });

  documents.listen(connection);

  connection.listen();
} catch (e) {
  console.error(e);
}
