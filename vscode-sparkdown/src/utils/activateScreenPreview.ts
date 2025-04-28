import { SparkdownNodeName } from "@impower/sparkdown/src/types/SparkdownNodeName";
import * as vscode from "vscode";
import * as yaml from "yaml";
import { getDescendent } from "../../../packages/textmate-grammar-tree/src/tree/utils/getDescendent";
import { getStack } from "../../../packages/textmate-grammar-tree/src/tree/utils/getStack";
import { SparkdownDocumentManager } from "../managers/SparkdownDocumentManager";
import { getOpenTextDocument } from "./getOpenTextDocument";

let screenPreviewPanel: {
  panel: vscode.WebviewPanel;
  state: Map<string, { openPaths?: string[] }>;
} | null = null;

const programmaticEdits = new Map<string, number>();

export function activateScreenPreview(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { language: "sparkdown" },
      new ScreenPreviewCodeLensProvider()
    )
  );

  context.subscriptions.push(
    vscode.window.registerWebviewPanelSerializer(
      `sparkdown-preview-screen`,
      new SparkdownScreenPreviewSerializer(context)
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "sparkdown.previewScreen",
      async (uri: vscode.Uri, range: vscode.Range) => {
        const textDocument = await vscode.workspace.openTextDocument(uri);
        revealOrCreateWebviewPanel(context, textDocument, range);
      }
    )
  );

  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection((change) => {
      const editor = change.textEditor;
      const document = editor.document;
      if (document.languageId === "sparkdown") {
        const range = change.selections[0];
        if (range) {
          const screenRange = getScreenRange(editor.document, range.start);
          if (screenRange) {
            if (screenPreviewPanel && screenPreviewPanel.panel.visible) {
              updateWebviewContent(
                screenPreviewPanel.panel,
                editor.document,
                screenRange
              );
            }
          }
        }
      }
    })
  );
}

function getAllScreenRanges(document: vscode.TextDocument) {
  const parsedDoc = SparkdownDocumentManager.instance.get(document.uri);
  const annotations = SparkdownDocumentManager.instance.annotations(
    document.uri
  );
  const cur = annotations.declarations.iter();
  let ranges: vscode.Range[] = [];
  if (parsedDoc) {
    if (cur) {
      while (cur.value) {
        if (cur.value.type === "screen") {
          const range = parsedDoc.range(cur.from, cur.to);
          ranges.push(
            new vscode.Range(
              new vscode.Position(range.start.line, range.start.character),
              new vscode.Position(range.end.line, range.end.character)
            )
          );
        }
        cur.next();
      }
    }
  }
  return ranges;
}

function getScreenRange(
  document: vscode.TextDocument,
  position: vscode.Position
) {
  const parsedDoc = SparkdownDocumentManager.instance.get(document.uri);
  const tree = SparkdownDocumentManager.instance.tree(document.uri);

  if (!parsedDoc || !tree) {
    return null;
  }

  const stack = getStack<SparkdownNodeName>(
    tree,
    parsedDoc.offsetAt(position),
    -1
  );

  const viewDeclarationNode = stack.find((n) => n.name === "ViewDeclaration");
  if (viewDeclarationNode) {
    const viewKeyword = getDescendent("ViewKeyword", viewDeclarationNode);
    if (viewKeyword) {
      if (parsedDoc.read(viewKeyword.from, viewKeyword.to) === "screen") {
        const range = parsedDoc.range(
          viewDeclarationNode.from,
          viewDeclarationNode.to
        );
        const screenRange = new vscode.Range(
          new vscode.Position(range.start.line, range.start.character),
          new vscode.Position(range.end.line, range.end.character)
        );
        console.log("screenRange", screenRange);
        return screenRange;
      }
    }
  }

  return null;
}

class ScreenPreviewCodeLensProvider implements vscode.CodeLensProvider {
  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    console.log("provideCodeLenses");
    const ranges = getAllScreenRanges(document);
    return ranges.map(
      (range) =>
        new vscode.CodeLens(range, {
          title: "$(preview)$(dash)Screen Preview",
          command: "sparkdown.previewScreen",
          arguments: [document.uri, range],
        })
    );
  }
}

export class SparkdownScreenPreviewSerializer
  implements vscode.WebviewPanelSerializer
{
  constructor(readonly context: vscode.ExtensionContext) {}

  async deserializeWebviewPanel(
    panel: vscode.WebviewPanel,
    state: { textDocument: { uri: string }; openPaths: string[] }
  ) {
    if (state) {
      const { textDocument, openPaths } = state;
      const textDocumentUri = vscode.Uri.parse(textDocument.uri);
      const document = await getOpenTextDocument(textDocumentUri);
      if (document) {
        initializeWebviewPanel(panel, this.context, document, openPaths);
      } else {
        panel.dispose();
      }
    }
  }
}

function revealOrCreateWebviewPanel(
  context: vscode.ExtensionContext,
  textDocument: vscode.TextDocument,
  range: vscode.Range
) {
  if (screenPreviewPanel) {
    screenPreviewPanel.panel.reveal();
    updateWebviewContent(screenPreviewPanel.panel, textDocument, range);
    return;
  }

  const panel = vscode.window.createWebviewPanel(
    "sparkdown-preview-screen",
    "Screen Preview",
    vscode.ViewColumn.Two,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    }
  );

  initializeWebviewPanel(panel, context, textDocument);
}

function initializeWebviewPanel(
  panel: vscode.WebviewPanel,
  context: vscode.ExtensionContext,
  document: vscode.TextDocument,
  openPaths?: string[]
) {
  screenPreviewPanel ??= {
    panel,
    state: new Map(),
  };

  const docUri = document.uri.toString();

  if (screenPreviewPanel) {
    screenPreviewPanel.panel = panel;
    screenPreviewPanel.state ??= new Map();
    if (openPaths) {
      const state = screenPreviewPanel.state.get(docUri);
      if (state) {
        state.openPaths = openPaths;
      } else {
        screenPreviewPanel.state.set(docUri, { openPaths });
      }
    }
  }

  const text = document.getText();

  panel.iconPath = {
    light: vscode.Uri.joinPath(context.extensionUri, "icon-lang.png"),
    dark: vscode.Uri.joinPath(context.extensionUri, "icon-lang.png"),
  };

  panel.webview.onDidReceiveMessage(
    async (message) => {
      if (message.method === "initialized") {
        panel.webview.postMessage({
          method: "load",
          params: {
            textDocument: { uri: docUri },
            text,
            openPaths,
          },
        });
      }
      if (message.method === "state") {
        const { textDocument, openPaths } = message.params;
        if (openPaths) {
          if (screenPreviewPanel) {
            const state = screenPreviewPanel.state.get(textDocument.uri);
            if (state) {
              state.openPaths = openPaths;
            } else {
              screenPreviewPanel.state.set(textDocument.uri, {
                openPaths,
              });
            }
          }
        }
      }
      if (message.method === "update") {
        const { textDocument, path, value } = message.params;
        const document = await getOpenTextDocument(textDocument.uri);
        await editDocument(document, path, value);
      }
    },
    undefined,
    context.subscriptions
  );

  panel.onDidDispose(() => {
    screenPreviewPanel = null;
  });

  const jsWebviewUri = panel.webview
    .asWebviewUri(
      vscode.Uri.joinPath(
        context.extension.extensionUri,
        "out",
        "webviews",
        "screen-webview.js"
      )
    )
    .toString();

  panel.webview.html = getWebviewContent(jsWebviewUri);

  panel.webview.postMessage({
    method: "initialize",
  });
}

function getWebviewContent(jsWebviewUri: string): string {
  return html`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Screen Preview</title>
        <style>
          body {
            padding: 1rem;
            font-family: var(--vscode-font-family);
            color: var(--vscode-editor-foreground);
            background-color: var(--vscode-editor-background);
            display: flex;
            flex-direction: column;
            gap: 1rem;
          }
        </style>
      </head>
      <body>
        <sparkdown-screen-preview></sparkdown-screen-preview>
        <script type="module" src="${jsWebviewUri}"></script>
      </body>
    </html>
  `;
}

async function updateWebviewContent(
  panel: vscode.WebviewPanel,
  textDocument: vscode.TextDocument,
  range: vscode.Range
) {
  const text = textDocument.getText(range);
  console.warn("RANGE", range, JSON.stringify(text));

  const state = screenPreviewPanel?.state.get(textDocument.uri.toString());

  panel.webview.postMessage({
    method: "load",
    params: {
      textDocument: { uri: textDocument.uri.toString() },
      text,
      openPaths: state?.openPaths,
    },
  });
}

async function editDocument(
  textDocument: vscode.TextDocument,
  path: string,
  value: any
) {
  const text = textDocument.getText();
  const doc = yaml.parseDocument(text, { keepSourceTokens: true });

  const keys = path.split(".");
  let node = doc.contents;

  for (const key of keys) {
    if (!node || !("get" in node)) return;
    node = node.get(key, true) as any;
  }

  if (!node || !node.range) return;

  const [startOffset, valueEndOffset] = node.range;
  const startPos = textDocument.positionAt(startOffset);
  const endPos = textDocument.positionAt(valueEndOffset);

  const range = new vscode.Range(startPos, endPos);
  const serializedValue = yaml.stringify(value).trim();

  const edit = new vscode.WorkspaceEdit();
  edit.replace(textDocument.uri, range, serializedValue);

  const uriStr = textDocument.uri.toString();

  markProgrammaticEdit(uriStr);

  await vscode.workspace.applyEdit(edit);

  setTimeout(() => unmarkProgrammaticEdit(uriStr), 100);
}

function markProgrammaticEdit(uri: string) {
  programmaticEdits.set(uri, (programmaticEdits.get(uri) ?? 0) + 1);
}

function unmarkProgrammaticEdit(uri: string) {
  const count = programmaticEdits.get(uri) ?? 0;
  if (count <= 1) {
    programmaticEdits.delete(uri);
  } else {
    programmaticEdits.set(uri, count - 1);
  }
}

function isProgrammaticEdit(uri: string): boolean {
  return (programmaticEdits.get(uri) ?? 0) > 0;
}

const html = (
  raw: readonly string[] | ArrayLike<string>,
  ...substitutions: any[]
) => String.raw({ raw }, ...substitutions.map((s) => String(s)));
