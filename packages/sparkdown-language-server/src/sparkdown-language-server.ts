import {
  CodeActionKind,
  DiagnosticRefreshRequest,
  SemanticTokensRefreshRequest,
  type InitializeResult,
  type ServerCapabilities,
} from "vscode-languageserver";
import {
  BrowserMessageReader,
  BrowserMessageWriter,
  createConnection,
  TextDocumentSyncKind,
} from "vscode-languageserver/browser";
import type {
  AddressQuery,
  ProgramAddress,
} from "@impower/sparkdown/src/compiler/types/ProgramAddress";
import { SparkdownLanguageServerWorkspace } from "./classes/SparkdownLanguageServerWorkspace";
import { createImageCompositeOptions } from "./utils/providers/imagePreviewOptions";
import { profiled } from "./utils/logging/profiled";
import { canRename } from "./utils/providers/canRename";
import { getCodeActions } from "./utils/providers/getCodeActions";
import { getCodeLenses } from "./utils/providers/getCodeLenses";
import { getColorPresentations } from "./utils/providers/getColorPresentations";
import { getAnnotatedScripts } from "./utils/annotations/getAnnotatedScripts";
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

// workaround(typescript): with the DOM lib loaded, `self` in a dedicated worker is typed as Window
declare const self: DedicatedWorkerGlobalScope;

console.log("running sparkdown-language-server v1.0");

try {
  const messageReader = new BrowserMessageReader(self);
  const messageWriter = new BrowserMessageWriter(self);
  const connection = createConnection(messageReader, messageWriter);

  const workspace = new SparkdownLanguageServerWorkspace(connection);

  const imageCompositeOptions = createImageCompositeOptions(workspace);

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
    codeActionProvider: {
      codeActionKinds: [CodeActionKind.QuickFix],
    },
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
    // workaround(vscode-languageserver): languages.*.refresh() returns the request promise but is typed void, so the refresh is sent directly
    const ignoreRefusal = () => {};
    connection
      .sendRequest(SemanticTokensRefreshRequest.type)
      .catch(ignoreRefusal);
    connection.sendRequest(DiagnosticRefreshRequest.type).catch(ignoreRefusal);
  });

  const foldingRangeCache = new Map<
    string,
    { documentVersion: number; programVersion: number | undefined; result: any }
  >();
  const semanticTokensCache = new Map<
    string,
    { documentVersion: number; programVersion: number | undefined; result: any }
  >();

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
    const result = profiled("lsp: onFoldingRanges", uri, () =>
      getFoldingRanges(document, annotations, program, workspace.tree(uri)),
    );
    if (document) {
      foldingRangeCache.set(uri, {
        documentVersion: document.version,
        programVersion: program?.version,
        result,
      });
    }
    return result;
  });

  connection.onDocumentColor((params) => {
    const uri = params.textDocument.uri;
    const document = workspace.document(uri);
    const annotations = workspace.annotations(uri);
    const program = workspace.program(uri);
    const result = profiled("lsp: onDocumentColor", uri, () =>
      getDocumentColors(document, annotations, program),
    );
    return result;
  });
  connection.onColorPresentation((params) => {
    const result = profiled("lsp: onColorPresentation", undefined, () =>
      getColorPresentations(params.color),
    );
    return result;
  });

  connection.onDocumentSymbol((params) => {
    const uri = params.textDocument.uri;
    const document = workspace.document(uri);
    const annotations = workspace.annotations(uri);
    const result = profiled("lsp: onDocumentSymbol", uri, () =>
      getDocumentSymbols(document, annotations, workspace.tree(uri)),
    );
    return result;
  });

  connection.onHover((params) => {
    const uri = params.textDocument.uri;
    const document = workspace.document(uri);
    const tree = workspace.tree(uri);
    const annotations = workspace.annotations(uri);
    const program = workspace.program(uri);
    const config = workspace.compilerConfig;
    const result = profiled("lsp: onHover", uri, () =>
      getHover(
        document,
        tree,
        annotations,
        program,
        config,
        params.position,
        imageCompositeOptions,
      ),
    );
    return result;
  });

  connection.onCompletion((params) => {
    const uri = params.textDocument.uri;
    const document = workspace.document(uri);
    const tree = workspace.tree(uri);
    const program = workspace.program(uri);
    const config = workspace.compilerConfig;
    const scripts = getAnnotatedScripts(uri, program?.scripts, workspace);
    const result = profiled("lsp: onCompletion", uri, () =>
      getCompletions(
        document,
        tree,
        scripts,
        program,
        config,
        params.position,
        params.context,
      ),
    );
    if (result) {
      for (const item of result) {
        if (item.data) {
          (item.data as CompletionItemResolveData).uri = uri;
        }
      }
    }
    return result;
  });

  connection.onCompletionResolve(async (item) => {
    const data = item.data as CompletionItemResolveData | undefined;
    if (!data?.uri) {
      return item;
    }
    const resolved = await profiled(
      "lsp: onCompletionResolve",
      item.label,
      () => {
        const program = workspace.program(data.uri);
        return resolveCompletion(item, program, imageCompositeOptions);
      },
    );
    return resolved;
  });

  connection.onDocumentFormatting(async (params) => {
    const settings = await connection.workspace.getConfiguration("sparkdown");
    workspace.loadConfiguration(settings);
    const uri = params.textDocument.uri;
    const document = workspace.document(uri);
    const tree = workspace.tree(uri);
    const annotations = workspace.annotations(uri);
    const result = profiled("lsp: onDocumentFormatting", uri, () => {
      const dirtyRange = document
        ? workspace.formatDirtyRange(uri, document.getText())
        : undefined;
      const edits = getDocumentFormattingEdits(
        document,
        tree,
        annotations,
        params.options,
        undefined,
        undefined,
        dirtyRange,
      );
      if (document) {
        const formatted = edits
          ? applyTextEdits(document, edits)
          : document.getText();
        workspace.markFormatted(uri, formatted);
      }
      return edits;
    });
    return result;
  });

  connection.onDocumentRangeFormatting(async (params) => {
    const settings = await connection.workspace.getConfiguration("sparkdown");
    workspace.loadConfiguration(settings);
    const uri = params.textDocument.uri;
    const document = workspace.document(uri);
    const tree = workspace.tree(uri);
    const annotations = workspace.annotations(uri);
    const result = profiled("lsp: onDocumentRangeFormatting", uri, () =>
      getDocumentFormattingEdits(
        document,
        tree,
        annotations,
        params.options,
        params.range,
      ),
    );
    return result;
  });

  connection.onDocumentOnTypeFormatting(async (params) => {
    const settings = await connection.workspace.getConfiguration("sparkdown");
    workspace.loadConfiguration(settings);
    const uri = params.textDocument.uri;
    const document = workspace.document(uri);
    const tree = workspace.tree(uri);
    const annotations = workspace.annotations(uri);
    const result = profiled("lsp: onDocumentOnTypeFormatting", uri, () =>
      getDocumentFormattingEdits(
        document,
        tree,
        annotations,
        params.options,
        undefined,
        params.position,
      ),
    );
    return result;
  });

  connection.onPrepareRename((params) => {
    const uri = params.textDocument.uri;
    const document = workspace.document(uri);
    const tree = workspace.tree(uri);
    const result = profiled("lsp: onPrepareRename", uri, () =>
      canRename(document, tree, params.position),
    );
    return result;
  });

  connection.onRenameRequest(async (params) => {
    const settings = await connection.workspace.getConfiguration("sparkdown");
    workspace.loadConfiguration(settings);
    const uri = params.textDocument.uri;
    const document = workspace.document(uri);
    const tree = workspace.tree(uri);
    const program = workspace.program(uri);
    const result = profiled("lsp: onRenameRequest", uri, () =>
      getRenameEdits(
        settings,
        document,
        tree,
        program,
        workspace,
        params.newName,
        params.position,
      ),
    );
    return result;
  });

  connection.onRequest(
    "sparkdown/fileReferences",
    (params: { uri: string }) => {
      const mainUri = workspace.getMainScriptUri(params.uri);
      const program = workspace.program(mainUri ?? params.uri);
      return getFileReferences(workspace, program, params.uri)?.references ?? [];
    },
  );
  connection.onRequest(
    "sparkdown/offsetSourceLocation",
    (params: { uri: string; line: number; offset: number }) => {
      const mainUri = workspace.getMainScriptUri(params.uri);
      const program = workspace.program(mainUri ?? params.uri);
      return getOffsetSourceLocation(
        program,
        program && workspace.locatorOf(program),
        params.uri,
        params.line,
        params.offset,
      );
    },
  );
  connection.onRequest(
    "sparkdown/addressAt",
    async (params: { uri: string; line: number; query?: AddressQuery }) => {
      const mainUri = workspace.getMainScriptUri(params.uri);
      const program = workspace.program(mainUri ?? params.uri);
      return program
        ? ((await workspace
            .locatorOf(program)
            .addressAt(params.uri, params.line, params.query)) ?? null)
        : null;
    },
  );
  connection.onRequest(
    "sparkdown/locationOf",
    async (params: { uri: string; address: ProgramAddress }) => {
      const mainUri = workspace.getMainScriptUri(params.uri);
      const program = workspace.program(mainUri ?? params.uri);
      return program && params.address != null
        ? ((await workspace.locatorOf(program).locationOf(params.address)) ??
            null)
        : null;
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

  connection.onReferences((params) => {
    const uri = params.textDocument.uri;
    const document = workspace.document(uri);
    const tree = workspace.tree(uri);
    const program = workspace.program(uri);
    const { references } = profiled("lsp: onReferences", uri, () =>
      getReferences(document, tree, program, workspace, params.position, {
        ...params.context,
        searchOtherFiles: true,
        includeInterdependent: true,
        includeLinks: true,
      }),
    );
    return references;
  });

  connection.onDeclaration((params) => {
    const uri = params.textDocument.uri;
    const document = workspace.document(uri);
    const tree = workspace.tree(uri);
    const program = workspace.program(uri);
    const { references } = profiled("lsp: onDeclaration", uri, () =>
      getReferences(document, tree, program, workspace, params.position, {
        searchOtherFiles: true,
        includeDeclaration: true,
        excludeUses: true,
        includeInterdependent: false,
        includeLinks: false,
      }),
    );
    return references;
  });

  connection.onDefinition((params) => {
    const uri = params.textDocument.uri;
    const document = workspace.document(uri);
    const tree = workspace.tree(uri);
    const program = workspace.program(uri);
    const { references } = profiled("lsp: onDefinition", uri, () =>
      getReferences(document, tree, program, workspace, params.position, {
        searchOtherFiles: true,
        includeDeclaration: true,
        excludeUses: true,
        includeInterdependent: false,
        includeLinks: false,
      }),
    );
    return references;
  });

  connection.onDocumentLinks((params) => {
    const uri = params.textDocument.uri;
    const document = workspace.document(uri);
    const tree = workspace.tree(uri);
    const annotations = workspace.annotations(uri);
    const result = profiled("lsp: onDocumentLinks", uri, () =>
      getDocumentLinks(document, tree, annotations, workspace),
    );
    return result;
  });

  connection.onDocumentHighlight((params) => {
    const uri = params.textDocument.uri;
    const document = workspace.document(uri);
    const tree = workspace.tree(uri);
    const program = workspace.program(uri);
    const { references } = profiled("lsp: onDocumentHighlight", uri, () =>
      getReferences(document, tree, program, workspace, params.position, {
        searchOtherFiles: false,
        includeDeclaration: true,
        includeInterdependent: true,
        includeLinks: true,
      }),
    );
    return references;
  });

  connection.languages.semanticTokens.on(async (params) => {
    const uri = params.textDocument.uri;
    const program =
      workspace.program(uri) || (await workspace.compile(uri, false));
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
    const result = profiled("lsp: semanticTokens.on", uri, () =>
      getSemanticTokens(document, annotations, program),
    );
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
    const result = profiled("lsp: semanticTokens.onRange", uri, () =>
      getSemanticTokens(document, annotations, program, params.range),
    );
    return result;
  });

  connection.onCodeLens((params) => {
    const uri = params.textDocument.uri;
    const document = workspace.document(uri);
    const annotations = workspace.annotations(uri);
    const result = profiled("lsp: onCodeLens", uri, () =>
      getCodeLenses(document, annotations),
    );
    return result;
  });

  connection.onCodeAction((params) => {
    const uri = params.textDocument.uri;
    const document = workspace.document(uri);
    const result = profiled("lsp: onCodeAction", uri, () =>
      getCodeActions(
        document,
        params.context.diagnostics,
        workspace.startSceneMissingIn(uri),
      ),
    );
    return result;
  });

  workspace.listen();

  connection.listen();
} catch (e) {
  console.error(e);
}
