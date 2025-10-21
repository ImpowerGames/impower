import { SparkdownAnnotations } from "@impower/sparkdown/src/compiler/classes/SparkdownCombinedAnnotator";
import {
  type InitializeResult,
  type ServerCapabilities,
} from "vscode-languageserver";
import {
  BrowserMessageReader,
  BrowserMessageWriter,
  createConnection,
  TextDocumentSyncKind,
} from "vscode-languageserver/browser";
import { SparkdownLanguageServerWorkspace } from "./classes/SparkdownLanguageServerWorkspace";
import { canRename } from "./utils/providers/canRename";
import { getColorPresentations } from "./utils/providers/getColorPresentations";
import { getCompletions } from "./utils/providers/getCompletions";
import { getDocumentColors } from "./utils/providers/getDocumentColors";
import { getDocumentFormattingEdits } from "./utils/providers/getDocumentFormattingEdits";
import { getDocumentLinks } from "./utils/providers/getDocumentLinks";
import { getDocumentSymbols } from "./utils/providers/getDocumentSymbols";
import { getFoldingRanges } from "./utils/providers/getFoldingRanges";
import { getHover } from "./utils/providers/getHover";
import { getReferences } from "./utils/providers/getReferences";
import { getRenameEdits } from "./utils/providers/getRenameEdits";
import {
  getSemanticTokens,
  TOKEN_MODIFIERS,
  TOKEN_TYPES,
} from "./utils/providers/getSemanticTokens";

console.log("running sparkdown-language-server");

try {
  const messageReader = new BrowserMessageReader(self);
  const messageWriter = new BrowserMessageWriter(self);
  const connection = createConnection(messageReader, messageWriter);

  const workspace = new SparkdownLanguageServerWorkspace(connection);

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
          "{",
          "}",
          "(",
          ")",
          "[",
          "]",
          "<",
          ">",
          "^",
          "$",
          "%",
          "@",
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
      documentFormattingProvider: true,
      documentRangeFormattingProvider: true,
      documentOnTypeFormattingProvider: {
        firstTriggerCharacter: "\n",
        moreTriggerCharacter: [":", "]", "}", ")", "\n"],
      },
      renameProvider: {
        prepareProvider: true,
      },
      referencesProvider: true,
      declarationProvider: true,
      documentLinkProvider: {
        resolveProvider: false,
      },
      documentHighlightProvider: true,
      semanticTokensProvider: {
        legend: {
          tokenTypes: TOKEN_TYPES,
          tokenModifiers: TOKEN_MODIFIERS,
        },
        range: true,
        full: true,
      },
    };
    const workspaceFolders = params?.workspaceFolders;
    if (workspaceFolders) {
      workspace.loadWorkspaceFolders(workspaceFolders);
    }
    const { program } = await workspace.initialize(
      params?.initializationOptions
    );
    if (program) {
      return { capabilities, program };
    }
    return { capabilities };
  });

  connection.onInitialized(async () => {
    const settings = await connection.workspace.getConfiguration("sparkdown");
    workspace.loadConfiguration(settings);
  });

  // foldingRangeProvider
  connection.onFoldingRanges((params) => {
    const uri = params.textDocument.uri;
    const document = workspace.document(uri);
    const annotations = workspace.annotations(uri);
    const program = workspace.program(uri);
    performance.mark(`lsp: onFoldingRanges ${uri} start`);
    const result = getFoldingRanges(document, annotations, program);
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
    const document = workspace.document(uri);
    const annotations = workspace.annotations(uri);
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
    const document = workspace.document(uri);
    const annotations = workspace.annotations(uri);
    performance.mark(`lsp: onDocumentSymbol ${uri} start`);
    const result = getDocumentSymbols(document, annotations);
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
    const document = workspace.document(uri);
    const annotations = workspace.annotations(uri);
    const program = workspace.program(uri);
    const config = workspace.compilerConfig;
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
    const document = workspace.document(uri);
    const tree = workspace.tree(uri);
    const program = workspace.program(uri);
    const config = workspace.compilerConfig;
    const scripts = program?.scripts || [uri];
    const scriptAnnotations = new Map<string, SparkdownAnnotations>();
    for (const uri of Object.keys(scripts)) {
      scriptAnnotations.set(uri, workspace.annotations(uri));
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

  // documentFormattingProvider
  connection.onDocumentFormatting(async (params) => {
    const settings = await connection.workspace.getConfiguration("sparkdown");
    workspace.loadConfiguration(settings);
    const uri = params.textDocument.uri;
    const document = workspace.document(uri);
    const tree = workspace.tree(uri);
    const annotations = workspace.annotations(uri);
    performance.mark(`lsp: onDocumentFormatting ${uri} start`);
    const result = getDocumentFormattingEdits(
      settings,
      document,
      tree,
      annotations,
      params.options
    );
    performance.mark(`lsp: onDocumentFormatting ${uri} end`);
    performance.measure(
      `lsp: onDocumentFormatting ${uri}`,
      `lsp: onDocumentFormatting ${uri} start`,
      `lsp: onDocumentFormatting ${uri} end`
    );
    return result;
  });

  // documentRangeFormattingProvider
  connection.onDocumentRangeFormatting(async (params) => {
    const settings = await connection.workspace.getConfiguration("sparkdown");
    workspace.loadConfiguration(settings);
    const uri = params.textDocument.uri;
    const document = workspace.document(uri);
    const tree = workspace.tree(uri);
    const annotations = workspace.annotations(uri);
    performance.mark(`lsp: onDocumentRangeFormatting ${uri} start`);
    const result = getDocumentFormattingEdits(
      settings,
      document,
      tree,
      annotations,
      params.options,
      params.range
    );
    performance.mark(`lsp: onDocumentRangeFormatting ${uri} end`);
    performance.measure(
      `lsp: onDocumentRangeFormatting ${uri}`,
      `lsp: onDocumentRangeFormatting ${uri} start`,
      `lsp: onDocumentRangeFormatting ${uri} end`
    );
    return result;
  });

  // documentOnTypeFormattingProvider
  connection.onDocumentOnTypeFormatting(async (params) => {
    const settings = await connection.workspace.getConfiguration("sparkdown");
    workspace.loadConfiguration(settings);
    const uri = params.textDocument.uri;
    const document = workspace.document(uri);
    const tree = workspace.tree(uri);
    const annotations = workspace.annotations(uri);
    performance.mark(`lsp: onDocumentOnTypeFormatting ${uri} start`);
    const result = getDocumentFormattingEdits(
      settings,
      document,
      tree,
      annotations,
      params.options,
      params.position
    );
    performance.mark(`lsp: onDocumentOnTypeFormatting ${uri} end`);
    performance.measure(
      `lsp: onDocumentOnTypeFormatting ${uri}`,
      `lsp: onDocumentOnTypeFormatting ${uri} start`,
      `lsp: onDocumentOnTypeFormatting ${uri} end`
    );
    return result;
  });

  // prepareRenameProvider
  connection.onPrepareRename((params) => {
    const uri = params.textDocument.uri;
    const document = workspace.document(uri);
    const tree = workspace.tree(uri);
    performance.mark(`lsp: onPrepareRename ${uri} start`);
    const result = canRename(document, tree, params.position);
    performance.mark(`lsp: onPrepareRename ${uri} end`);
    performance.measure(
      `lsp: onPrepareRename ${uri}`,
      `lsp: onPrepareRename ${uri} start`,
      `lsp: onPrepareRename ${uri} end`
    );
    return result;
  });

  // renameProvider
  connection.onRenameRequest(async (params) => {
    const settings = await connection.workspace.getConfiguration("sparkdown");
    workspace.loadConfiguration(settings);
    const uri = params.textDocument.uri;
    const document = workspace.document(uri);
    const tree = workspace.tree(uri);
    const program = workspace.program(uri);
    performance.mark(`lsp: onRenameRequest ${uri} start`);
    const result = getRenameEdits(
      settings,
      document,
      tree,
      program,
      workspace,
      params.newName,
      params.position
    );
    performance.mark(`lsp: onRenameRequest ${uri} end`);
    performance.measure(
      `lsp: onRenameRequest ${uri}`,
      `lsp: onRenameRequest ${uri} start`,
      `lsp: onRenameRequest ${uri} end`
    );
    return result;
  });

  // referencesProvider
  connection.onReferences((params) => {
    const uri = params.textDocument.uri;
    const document = workspace.document(uri);
    const tree = workspace.tree(uri);
    const program = workspace.program(uri);
    performance.mark(`lsp: onReferences ${uri} start`);
    const { references } = getReferences(
      document,
      tree,
      program,
      workspace,
      params.position,
      {
        ...params.context,
        searchOtherFiles: true,
        includeInterdependent: true,
        includeLinks: true,
      }
    );
    performance.mark(`lsp: onReferences ${uri} end`);
    performance.measure(
      `lsp: onReferences ${uri}`,
      `lsp: onReferences ${uri} start`,
      `lsp: onReferences ${uri} end`
    );
    return references;
  });

  // declarationProvider
  connection.onDeclaration((params) => {
    const uri = params.textDocument.uri;
    const document = workspace.document(uri);
    const tree = workspace.tree(uri);
    const program = workspace.program(uri);
    performance.mark(`lsp: onDeclaration ${uri} start`);
    const { references } = getReferences(
      document,
      tree,
      program,
      workspace,
      params.position,
      {
        searchOtherFiles: true,
        includeDeclaration: true,
        excludeUses: true,
        includeInterdependent: false,
        includeLinks: false,
      }
    );
    performance.mark(`lsp: onDeclaration ${uri} end`);
    performance.measure(
      `lsp: onDeclaration ${uri}`,
      `lsp: onDeclaration ${uri} start`,
      `lsp: onDeclaration ${uri} end`
    );
    return references;
  });

  // documentLinkProvider
  connection.onDocumentLinks((params) => {
    const uri = params.textDocument.uri;
    const document = workspace.document(uri);
    const tree = workspace.tree(uri);
    const annotations = workspace.annotations(uri);
    performance.mark(`lsp: onDocumentLinks ${uri} start`);
    const result = getDocumentLinks(document, tree, annotations, workspace);
    performance.mark(`lsp: onDocumentLinks ${uri} end`);
    performance.measure(
      `lsp: onDocumentLinks ${uri}`,
      `lsp: onDocumentLinks ${uri} start`,
      `lsp: onDocumentLinks ${uri} end`
    );
    return result;
  });

  // documentHighlightProvider
  connection.onDocumentHighlight((params) => {
    const uri = params.textDocument.uri;
    const document = workspace.document(uri);
    const tree = workspace.tree(uri);
    const program = workspace.program(uri);
    performance.mark(`lsp: onDocumentHighlight ${uri} start`);
    const { references } = getReferences(
      document,
      tree,
      program,
      workspace,
      params.position,
      {
        searchOtherFiles: false,
        includeDeclaration: true,
        includeInterdependent: true,
        includeLinks: true,
      }
    );
    performance.mark(`lsp: onDocumentHighlight ${uri} end`);
    performance.measure(
      `lsp: onDocumentHighlight ${uri}`,
      `lsp: onDocumentHighlight ${uri} start`,
      `lsp: onDocumentHighlight ${uri} end`
    );
    return references;
  });

  // semanticTokensProvider
  connection.languages.semanticTokens.on(async (params) => {
    const uri = params.textDocument.uri;
    const document = workspace.document(uri);
    const annotations = workspace.annotations(uri);
    const program =
      workspace.program(uri) || (await workspace.compile(uri, true));
    performance.mark(`lsp: semanticTokens.on ${uri} start`);
    const result = getSemanticTokens(document, annotations, program);
    performance.mark(`lsp: semanticTokens.on ${uri} end`);
    performance.measure(
      `lsp: semanticTokens.on ${uri}`,
      `lsp: semanticTokens.on ${uri} start`,
      `lsp: semanticTokens.on ${uri} end`
    );
    return result;
  });
  connection.languages.semanticTokens.onRange(async (params) => {
    const uri = params.textDocument.uri;
    const document = workspace.document(uri);
    const annotations = workspace.annotations(uri);
    const program =
      workspace.program(uri) || (await workspace.compile(uri, true));
    performance.mark(`lsp: semanticTokens.onRange ${uri} start`);
    const result = getSemanticTokens(
      document,
      annotations,
      program,
      params.range
    );
    performance.mark(`lsp: semanticTokens.onRange ${uri} end`);
    performance.measure(
      `lsp: semanticTokens.onRange ${uri}`,
      `lsp: semanticTokens.onRange ${uri} start`,
      `lsp: semanticTokens.onRange ${uri} end`
    );
    return result;
  });

  workspace.listen();

  connection.listen();
} catch (e) {
  console.error(e);
}
