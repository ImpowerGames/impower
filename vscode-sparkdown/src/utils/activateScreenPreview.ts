import { SparkdownNodeName } from "@impower/sparkdown/src/types/SparkdownNodeName";
import * as vscode from "vscode";
import * as yaml from "yaml";
import { getStack } from "../../../packages/textmate-grammar-tree/src/tree/utils/getStack";
import { onDidChangeCodeLensesEmitter } from "../events/onDidChangeCodeLensesEmitter";
import { SparkdownDocumentManager } from "../managers/SparkdownDocumentManager";
import { getOpenTextDocument } from "./getOpenTextDocument";

interface ScreenPreviewPanelState {
  textDocument?: { uri: string };
  ranges?: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  }[];
}

let screenPreviewPanel: {
  panel: vscode.WebviewPanel;
  state: ScreenPreviewPanelState;
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
      async (uri: vscode.Uri, ranges: vscode.Range[]) => {
        const textDocument = await vscode.workspace.openTextDocument(uri);
        revealOrCreateWebviewPanel(context, textDocument, ranges);
      }
    )
  );

  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection((change) => {
      if (change.kind !== vscode.TextEditorSelectionChangeKind.Keyboard) {
        const editor = change.textEditor;
        const document = editor.document;
        if (document.languageId === "sparkdown") {
          const range = change.selections[0];
          if (range) {
            if (screenPreviewPanel && screenPreviewPanel.panel.visible) {
              if (!SparkdownDocumentManager.instance.get(document.uri)) {
                SparkdownDocumentManager.instance.add(document);
              }
              const screenRange = getScreenRange(document, range.start);
              const screenDependencyRanges =
                getAllScreenDependencyRanges(document);
              if (screenRange) {
                const ranges = [screenRange, ...screenDependencyRanges];
                const prevSerializedScreenRange =
                  screenPreviewPanel.state.ranges?.[0] || null;
                const currentSerializedScreenRange = getSerializableRange(
                  ranges[0]!
                );
                if (
                  screenPreviewPanel.state.textDocument?.uri !==
                    document.uri.toString() ||
                  JSON.stringify(currentSerializedScreenRange) !==
                    JSON.stringify(prevSerializedScreenRange)
                )
                  updateWebviewContent(
                    screenPreviewPanel.panel,
                    document,
                    ranges
                  );
              }
            }
          }
        }
      }
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((change) => {
      const document = change.document;
      if (document.languageId === "sparkdown") {
        const range = change.contentChanges[0]?.range;
        if (range) {
          if (screenPreviewPanel && screenPreviewPanel.panel.visible) {
            SparkdownDocumentManager.instance.update(change);
            const currentSerializedScreenRange =
              screenPreviewPanel.state.ranges?.[0];
            const currentScreenRange = currentSerializedScreenRange
              ? getDocumentRange(currentSerializedScreenRange)
              : null;
            const screenRange =
              getScreenRange(document, range.start) || currentScreenRange;
            if (screenRange) {
              const screenDependencyRanges =
                getAllScreenDependencyRanges(document);
              const ranges = [screenRange, ...screenDependencyRanges];
              // TODO: Only update if change affects screen, screen view/css dependency, or screen variable
              updateWebviewContent(screenPreviewPanel.panel, document, ranges);
            }
          }
        }
      }
    })
  );
}

function getAllScreenRanges(document: vscode.TextDocument) {
  const parsedDoc = SparkdownDocumentManager.instance.get(document.uri);
  const tree = SparkdownDocumentManager.instance.tree(document.uri);
  const annotations = SparkdownDocumentManager.instance.annotations(
    document.uri
  );

  if (!parsedDoc || !tree) {
    return [];
  }

  const cur = annotations.declarations.iter();
  let ranges: vscode.Range[] = [];
  if (cur) {
    while (cur.value) {
      if (cur.value.type === "screen") {
        const stack = getStack<SparkdownNodeName>(tree, cur.from, -1);
        const declarationNode = stack.find(
          (n) => n.name === "ScreenDeclaration"
        );
        if (declarationNode) {
          const range = parsedDoc.range(
            declarationNode.from,
            declarationNode.to
          );
          ranges.push(
            new vscode.Range(
              new vscode.Position(range.start.line, range.start.character),
              new vscode.Position(range.end.line, range.end.character)
            )
          );
        }
      }
      cur.next();
    }
  }
  return ranges;
}

function getAllScreenDependencyRanges(document: vscode.TextDocument) {
  const parsedDoc = SparkdownDocumentManager.instance.get(document.uri);
  const tree = SparkdownDocumentManager.instance.tree(document.uri);
  const annotations = SparkdownDocumentManager.instance.annotations(
    document.uri
  );

  if (!parsedDoc || !tree) {
    return [];
  }

  const cur = annotations.declarations.iter();
  let ranges: vscode.Range[] = [];
  if (cur) {
    while (cur.value) {
      if (
        cur.value.type === "component" ||
        cur.value.type === "style" ||
        cur.value.type === "animation" ||
        cur.value.type === "theme"
      ) {
        const stack = getStack<SparkdownNodeName>(tree, cur.from, -1);
        const declarationNode = stack.find(
          (n) =>
            n.name === "ComponentDeclaration" || n.name === "CssDeclaration"
        );
        if (declarationNode) {
          const range = parsedDoc.range(
            declarationNode.from,
            declarationNode.to
          );
          ranges.push(
            new vscode.Range(
              new vscode.Position(range.start.line, range.start.character),
              new vscode.Position(range.end.line, range.end.character)
            )
          );
        }
      }
      cur.next();
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

  const declarationNode = stack.find((n) => n.name === "ScreenDeclaration");
  if (declarationNode) {
    const range = parsedDoc.range(declarationNode.from, declarationNode.to);
    const screenRange = new vscode.Range(
      new vscode.Position(range.start.line, range.start.character),
      new vscode.Position(range.end.line, range.end.character)
    );
    return screenRange;
  }

  return null;
}

function getDocumentRange(range: {
  start: { line: number; character: number };
  end: { line: number; character: number };
}) {
  return new vscode.Range(
    new vscode.Position(range.start.line, range.start.character),
    new vscode.Position(range.end.line, range.end.character)
  );
}

function getSerializableRange(range: vscode.Range): {
  start: { line: number; character: number };
  end: { line: number; character: number };
} {
  return {
    start: { line: range.start.line, character: range.start.character },
    end: { line: range.end.line, character: range.end.character },
  };
}

class ScreenPreviewCodeLensProvider implements vscode.CodeLensProvider {
  public readonly onDidChangeCodeLenses: vscode.Event<void> =
    onDidChangeCodeLensesEmitter.event;
  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const ranges = getAllScreenRanges(document);
    const screenDependencyRanges = getAllScreenDependencyRanges(document);
    return ranges.map(
      (range) =>
        new vscode.CodeLens(range, {
          title: "$(preview)$(dash)Screen Preview",
          command: "sparkdown.previewScreen",
          arguments: [document.uri, [range, ...screenDependencyRanges]],
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
    state: ScreenPreviewPanelState
  ) {
    if (state) {
      const { textDocument, ranges } = state;
      if (textDocument) {
        const textDocumentUri = vscode.Uri.parse(textDocument.uri);
        const document = await getOpenTextDocument(textDocumentUri);
        if (!SparkdownDocumentManager.instance.get(document.uri)) {
          SparkdownDocumentManager.instance.add(document);
        }
        if (document && ranges) {
          initializeWebviewPanel(
            panel,
            this.context,
            document,
            ranges.map((r) => getDocumentRange(r))
          );
        } else {
          panel.dispose();
        }
      }
    }
  }
}

function revealOrCreateWebviewPanel(
  context: vscode.ExtensionContext,
  textDocument: vscode.TextDocument,
  ranges: vscode.Range[]
) {
  if (screenPreviewPanel?.panel) {
    screenPreviewPanel.panel.reveal();
    updateWebviewContent(screenPreviewPanel.panel, textDocument, ranges);
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

  initializeWebviewPanel(panel, context, textDocument, ranges);
}

function initializeWebviewPanel(
  panel: vscode.WebviewPanel,
  context: vscode.ExtensionContext,
  document: vscode.TextDocument,
  documentRanges: vscode.Range[]
) {
  screenPreviewPanel ??= {
    panel,
    state: {},
  };

  const uri = document.uri.toString();

  const textDocument = { uri };
  const ranges = documentRanges.map((r) => getSerializableRange(r));

  if (screenPreviewPanel) {
    screenPreviewPanel.panel = panel;
    screenPreviewPanel.state.textDocument = textDocument;
    screenPreviewPanel.state.ranges = ranges;
  }

  const text = (documentRanges || [])
    .map((range) => document.getText(range))
    .join("\n\n");

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
            textDocument,
            ranges,
            text,
          },
        });
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
  document: vscode.TextDocument,
  documentRanges: vscode.Range[]
) {
  const text = documentRanges
    .map((range) => document.getText(range))
    .join("\n\n");

  const textDocument = { uri: document.uri.toString() };
  const ranges = documentRanges.map((r) => getSerializableRange(r));

  if (screenPreviewPanel) {
    screenPreviewPanel.panel = panel;
    screenPreviewPanel.state.textDocument = textDocument;
    screenPreviewPanel.state.ranges = ranges;
  }

  panel.webview.postMessage({
    method: "load",
    params: {
      textDocument,
      ranges,
      text,
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
