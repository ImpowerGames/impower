import * as vscode from "vscode";
import * as yaml from "yaml";
import { getOpenTextDocument } from "./getOpenTextDocument";

let screenPreviewPanel: {
  panel: vscode.WebviewPanel;
  state: Map<string, { openPaths?: string[] }>;
} | null = null;

const programmaticEdits = new Map<string, number>();

export function activateScreenPreview(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { language: "screen" },
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
      async (uri: vscode.Uri) => {
        const textDocument = await vscode.workspace.openTextDocument(uri);
        revealOrCreateWebviewPanel(context, textDocument);
      }
    )
  );

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (
        screenPreviewPanel &&
        editor &&
        editor.document.languageId === "screen"
      ) {
        updateWebviewContent(screenPreviewPanel.panel, editor.document);
      }
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      const uriStr = e.document.uri.toString();
      if (e.document.languageId === "screen" && !isProgrammaticEdit(uriStr)) {
        if (
          screenPreviewPanel &&
          screenPreviewPanel.panel.visible &&
          vscode.window.activeTextEditor?.document.uri.toString() ===
            e.document.uri.toString()
        ) {
          updateWebviewContent(screenPreviewPanel.panel, e.document);
        }
      }
    })
  );
}

class ScreenPreviewCodeLensProvider implements vscode.CodeLensProvider {
  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const topOfFile = new vscode.Range(0, 0, 0, 0);
    return [
      new vscode.CodeLens(topOfFile, {
        title: "$(preview)$(dash)Preview Screen",
        command: "sparkdown.previewScreen",
        arguments: [document.uri],
      }),
    ];
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
  textDocument: vscode.TextDocument
) {
  if (screenPreviewPanel) {
    screenPreviewPanel.panel.reveal();
    updateWebviewContent(screenPreviewPanel.panel, textDocument);
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
  textDocument: vscode.TextDocument
) {
  const text = textDocument.getText();

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
