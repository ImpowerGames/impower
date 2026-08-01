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
import { profile } from "./utils/logging/profile";
import { canRename } from "./utils/providers/canRename";
import { getCodeLenses } from "./utils/providers/getCodeLenses";
import { getColorPresentations } from "./utils/providers/getColorPresentations";
import { getCompletions } from "./utils/providers/getCompletions";
import {
  resolveCompletion,
  type CompletionItemResolveData,
} from "./utils/providers/resolveCompletion";
import { getDocumentColors } from "./utils/providers/getDocumentColors";
import { getDocumentFormattingEdits } from "./utils/providers/getDocumentFormattingEdits";
import { applyTextEdits } from "./utils/providers/getFormatDirtyRange";
import { getDocumentLinks } from "./utils/providers/getDocumentLinks";
import { getDocumentSymbols } from "./utils/providers/getDocumentSymbols";
import { getFileReferences } from "./utils/providers/getFileReferences";
import { getFileRenameEdits } from "./utils/providers/getFileRenameEdits";
import { getFoldingRanges } from "./utils/providers/getFoldingRanges";
import { getHover } from "./utils/providers/getHover";
import { getOffsetSourceLocation } from "./utils/providers/getOffsetSourceLocation";
import { getReferences } from "./utils/providers/getReferences";
import { getRenameEdits } from "./utils/providers/getRenameEdits";
import {
  getSemanticTokens,
  TOKEN_MODIFIERS,
  TOKEN_TYPES,
} from "./utils/providers/getSemanticTokens";

console.log("running sparkdown-language-server v1.0");

try {
  const messageReader = new BrowserMessageReader(self);
  const messageWriter = new BrowserMessageWriter(self);
  const connection = createConnection(messageReader, messageWriter);

  const workspace = new SparkdownLanguageServerWorkspace(connection);

  // Asset previews composite a layered image by reading its layers. impower-dev
  // serves assets over http so the worker just fetches them; VS Code's srcs are
  // workspace uris a worker can't fetch, so the bytes come back over the
  // extension bridge instead. Hosts that implement neither fall back to the
  // single-layer preview rather than failing.
  const imageCompositeOptions = {
    readFileBytes: (uri: string) => workspace.getFileBytes(uri),
  };

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
      // Asset previews are computed in `completionItem/resolve`, not up front:
      // a project-wide asset list can be hundreds of items and only the one the
      // user highlights ever needs its image.
      resolveProvider: true,
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
    definitionProvider: true,
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
    codeLensProvider: {},
  };

  connection.onInitialize(async (params): Promise<InitializeResult> => {
    const workspaceFolders = params?.workspaceFolders;
    if (workspaceFolders) {
      workspace.loadWorkspaceFolders(workspaceFolders);
    }
    const result = await workspace.initialize(params);
    return { capabilities, ...result };
  });

  connection.onInitialized(async () => {
    const settings = await connection.workspace.getConfiguration("sparkdown");
    workspace.loadConfiguration(settings);
    // Ask the client to re-request anything it may have asked for while we were
    // still starting up. Initialization loads every project file into the
    // compiler and runs a full compile, and on a large project that takes long
    // enough that the editor's first semantic-token / diagnostic requests are
    // rejected outright ("Compiler has not been configured!"). Those requests
    // are never retried on their own, so without this the features stay dead
    // until something else happens to trigger a re-request. See #224.
    try {
      connection.languages.semanticTokens.refresh();
      connection.languages.diagnostics.refresh();
    } catch (e) {
      console.error("failed to request client refresh after initialize", e);
    }
  });

  // Clients re-pull folding ranges and semantic tokens after every change AND
  // every refresh, so identical requests arrive in bursts. Both computations
  // are pure functions of (document version, program version) -- cache the
  // last result per uri and only recompute when either input moves.
  const foldingRangeCache = new Map<
    string,
    { documentVersion: number; programVersion: number | undefined; result: any }
  >();
  const semanticTokensCache = new Map<
    string,
    { documentVersion: number; programVersion: number | undefined; result: any }
  >();

  // foldingRangeProvider
  connection.onFoldingRanges((params) => {
    const uri = params.textDocument.uri;
    const document = workspace.document(uri);
    const annotations = workspace.annotations(uri);
    const program = workspace.program(uri);
    const cached = foldingRangeCache.get(uri);
    if (
      document &&
      cached &&
      cached.documentVersion === document.version &&
      cached.programVersion === program?.version
    ) {
      return cached.result;
    }
    profile("start", "lsp: onFoldingRanges", uri);
    const result = getFoldingRanges(document, annotations, program);
    profile("end", "lsp: onFoldingRanges", uri);
    if (document) {
      foldingRangeCache.set(uri, {
        documentVersion: document.version,
        programVersion: program?.version,
        result,
      });
    }
    return result;
  });

  // colorProvider
  connection.onDocumentColor((params) => {
    const uri = params.textDocument.uri;
    const document = workspace.document(uri);
    const annotations = workspace.annotations(uri);
    const program = workspace.program(uri);
    profile("start", "lsp: onDocumentColor", uri);
    const result = getDocumentColors(document, annotations, program);
    profile("end", "lsp: onDocumentColor", uri);
    return result;
  });
  connection.onColorPresentation((params) => {
    profile("start", "lsp: onDocumentColor");
    const result = getColorPresentations(params.color);
    profile("end", "lsp: onDocumentColor");
    return result;
  });

  // documentSymbolProvider
  connection.onDocumentSymbol((params) => {
    const uri = params.textDocument.uri;
    const document = workspace.document(uri);
    const annotations = workspace.annotations(uri);
    profile("start", "lsp: onDocumentSymbol", uri);
    const result = getDocumentSymbols(document, annotations);
    profile("end", "lsp: onDocumentSymbol", uri);
    return result;
  });

  // hoverProvider
  connection.onHover((params) => {
    const uri = params.textDocument.uri;
    const document = workspace.document(uri);
    const annotations = workspace.annotations(uri);
    const program = workspace.program(uri);
    const config = workspace.compilerConfig;
    profile("start", "lsp: onHover", uri);
    const result = getHover(
      document,
      annotations,
      program,
      config,
      params.position,
      imageCompositeOptions,
    );
    profile("end", "lsp: onHover", uri);
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
    profile("start", "lsp: onCompletion", uri);
    const result = getCompletions(
      document,
      tree,
      scriptAnnotations,
      program,
      config,
      params.position,
      params.context,
    );
    profile("end", "lsp: onCompletion", uri);
    // `workspace.program()` is keyed by the REQUESTED document uri, not by
    // `program.uri` (which is the compiled root), so resolve has to be told
    // which document it came from. Stamped here to keep uri plumbing out of
    // the completion builders.
    if (result) {
      for (const item of result) {
        if (item.data) {
          (item.data as CompletionItemResolveData).uri = uri;
        }
      }
    }
    return result;
  });

  // completionProvider.resolveProvider
  connection.onCompletionResolve(async (item) => {
    const data = item.data as CompletionItemResolveData | undefined;
    if (!data?.uri) {
      return item;
    }
    profile("start", "lsp: onCompletionResolve", item.label);
    const program = workspace.program(data.uri);
    const resolved = await resolveCompletion(
      item,
      program,
      imageCompositeOptions,
    );
    profile("end", "lsp: onCompletionResolve", item.label);
    return resolved;
  });

  // documentFormattingProvider
  connection.onDocumentFormatting(async (params) => {
    const settings = await connection.workspace.getConfiguration("sparkdown");
    workspace.loadConfiguration(settings);
    const uri = params.textDocument.uri;
    const document = workspace.document(uri);
    const tree = workspace.tree(uri);
    const annotations = workspace.annotations(uri);
    profile("start", "lsp: onDocumentFormatting", uri);
    // Incremental (delta) formatting for format-on-save: only reprocess
    // the construct(s) changed since the last format. The dirty range is
    // the diff against the last formatted output — safe because outside
    // it the text equals an already-formatted baseline.
    const dirtyRange = document
      ? workspace.formatDirtyRange(uri, document.getText())
      : undefined;
    const result = getDocumentFormattingEdits(
      document,
      tree,
      annotations,
      params.options,
      undefined,
      undefined,
      dirtyRange,
    );
    // Cache the resulting (fully formatted) text as the next diff
    // baseline. Apply our own edits to compute it — that's what the
    // editor will materialize.
    if (document) {
      const formatted = result
        ? applyTextEdits(document, result)
        : document.getText();
      workspace.markFormatted(uri, formatted);
    }
    profile("end", "lsp: onDocumentFormatting", uri);
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
    profile("start", "lsp: onDocumentRangeFormatting", uri);
    const result = getDocumentFormattingEdits(
      document,
      tree,
      annotations,
      params.options,
      params.range,
    );
    profile("end", "lsp: onDocumentRangeFormatting", uri);
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
    profile("start", "lsp: onDocumentOnTypeFormatting", uri);
    const result = getDocumentFormattingEdits(
      document,
      tree,
      annotations,
      params.options,
      undefined,
      params.position,
    );
    profile("end", "lsp: onDocumentOnTypeFormatting", uri);
    return result;
  });

  // prepareRenameProvider
  connection.onPrepareRename((params) => {
    const uri = params.textDocument.uri;
    const document = workspace.document(uri);
    const tree = workspace.tree(uri);
    profile("start", "lsp: onPrepareRename", uri);
    const result = canRename(document, tree, params.position);
    profile("end", "lsp: onPrepareRename", uri);
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
    profile("start", "lsp: onRenameRequest", uri);
    const result = getRenameEdits(
      settings,
      document,
      tree,
      program,
      workspace,
      params.newName,
      params.position,
    );
    profile("end", "lsp: onRenameRequest", uri);
    return result;
  });

  // Custom: file-driven (no cursor) reference queries for the file manager.
  // "sparkdown/fileReferences" — script locations that reference an asset file
  // (find-usages). "sparkdown/fileRenameEdits" — the WorkspaceEdit to rename an
  // asset file AND rewrite every reference to it. The asset has no program of
  // its own, so resolution uses the nearest main script's program.
  connection.onRequest(
    "sparkdown/fileReferences",
    (params: { uri: string }) => {
      const mainUri = workspace.getMainScriptUri(params.uri);
      const program = workspace.program(mainUri ?? params.uri);
      return getFileReferences(workspace, program, params.uri)?.references ?? [];
    },
  );
  // Custom: previous/next beat location for PageUp/PageDown navigation.
  // Answered here (rather than from a client-side copy of the program) so
  // `pathLocations` — ~12k entries / ~600KB on a feature-length script —
  // never has to ride along with every compile notification.
  connection.onRequest(
    "sparkdown/offsetSourceLocation",
    (params: { uri: string; line: number; offset: number }) => {
      const mainUri = workspace.getMainScriptUri(params.uri);
      const program = workspace.program(mainUri ?? params.uri);
      return getOffsetSourceLocation(
        program,
        params.uri,
        params.line,
        params.offset,
      );
    },
  );
  connection.onRequest(
    "sparkdown/fileRenameEdits",
    async (params: { oldUri: string; newName: string }) => {
      const settings = await connection.workspace.getConfiguration("sparkdown");
      workspace.loadConfiguration(settings);
      const mainUri = workspace.getMainScriptUri(params.oldUri);
      const program = workspace.program(mainUri ?? params.oldUri);
      return getFileRenameEdits(
        workspace,
        program,
        params.oldUri,
        params.newName,
      );
    },
  );

  // referencesProvider
  connection.onReferences((params) => {
    const uri = params.textDocument.uri;
    const document = workspace.document(uri);
    const tree = workspace.tree(uri);
    const program = workspace.program(uri);
    profile("start", "lsp: onReferences", uri);
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
      },
    );
    profile("end", "lsp: onReferences", uri);
    return references;
  });

  // declarationProvider
  connection.onDeclaration((params) => {
    const uri = params.textDocument.uri;
    const document = workspace.document(uri);
    const tree = workspace.tree(uri);
    const program = workspace.program(uri);
    profile("start", "lsp: onDeclaration", uri);
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
      },
    );
    profile("end", "lsp: onDeclaration", uri);
    return references;
  });

  // definitionProvider
  connection.onDefinition((params) => {
    const uri = params.textDocument.uri;
    const document = workspace.document(uri);
    const tree = workspace.tree(uri);
    const program = workspace.program(uri);
    profile("start", "lsp: onDefinition", uri);
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
      },
    );
    profile("end", "lsp: onDefinition", uri);
    return references;
  });

  // documentLinkProvider
  connection.onDocumentLinks((params) => {
    const uri = params.textDocument.uri;
    const document = workspace.document(uri);
    const tree = workspace.tree(uri);
    const annotations = workspace.annotations(uri);
    profile("start", "lsp: onDocumentLinks", uri);
    const result = getDocumentLinks(document, tree, annotations, workspace);
    profile("end", "lsp: onDocumentLinks", uri);
    return result;
  });

  // documentHighlightProvider
  connection.onDocumentHighlight((params) => {
    const uri = params.textDocument.uri;
    const document = workspace.document(uri);
    const tree = workspace.tree(uri);
    const program = workspace.program(uri);
    profile("start", "lsp: onDocumentHighlight", uri);
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
      },
    );
    profile("end", "lsp: onDocumentHighlight", uri);
    return references;
  });

  // semanticTokensProvider
  connection.languages.semanticTokens.on(async (params) => {
    const uri = params.textDocument.uri;
    const program =
      workspace.program(uri) || (await workspace.compile(uri, false));
    // Read the document/annotations AFTER the potential compile await, so a
    // didChange processed during it can't leave us caching a result built
    // from older annotations under the newer document version.
    const document = workspace.document(uri);
    const annotations = workspace.annotations(uri);
    const cached = semanticTokensCache.get(uri);
    if (
      document &&
      cached &&
      cached.documentVersion === document.version &&
      cached.programVersion === program?.version
    ) {
      return cached.result;
    }
    profile("start", "lsp: semanticTokens.on", uri);
    const result = getSemanticTokens(document, annotations, program);
    profile("end", "lsp: semanticTokens.on", uri);
    if (document) {
      semanticTokensCache.set(uri, {
        documentVersion: document.version,
        programVersion: program?.version,
        result,
      });
    }
    return result;
  });
  connection.languages.semanticTokens.onRange(async (params) => {
    const uri = params.textDocument.uri;
    const program =
      workspace.program(uri) || (await workspace.compile(uri, false));
    const document = workspace.document(uri);
    const annotations = workspace.annotations(uri);
    profile("start", "lsp: semanticTokens.onRange", uri);
    const result = getSemanticTokens(
      document,
      annotations,
      program,
      params.range,
    );
    profile("end", "lsp: semanticTokens.onRange", uri);
    return result;
  });

  // codeLensProvider
  connection.onCodeLens((params) => {
    const uri = params.textDocument.uri;
    const document = workspace.document(uri);
    const annotations = workspace.annotations(uri);
    profile("start", "lsp: onCodeLens", uri);
    const result = getCodeLenses(document, annotations);
    profile("end", "lsp: onCodeLens", uri);
    return result;
  });

  workspace.listen();

  connection.listen();
} catch (e) {
  console.error(e);
}
