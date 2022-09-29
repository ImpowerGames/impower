import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { SparkScreenplayConfig } from "../../../spark-screenplay";
import { parseSpark } from "../../../sparkdown";
import { getDirectoryPath } from "../getDirectoryPath";
import { getActiveSparkdownDocument } from "../utils/getActiveSparkdownDocument";
import { getEditor } from "../utils/getEditor";
import { getSparkdownConfig } from "../utils/getSparkdownConfig";
import { retrieveScreenPlayStatistics } from "../utils/statistics";

interface statisticsPanel {
  uri: string;
  panel: vscode.WebviewPanel;
  id: number;
}

export const statsPanels: statisticsPanel[] = [];

export function getStatisticsPanels(docuri: vscode.Uri): statisticsPanel[] {
  const selectedPanels: statisticsPanel[] = [];
  for (let i = 0; i < statsPanels.length; i++) {
    if (statsPanels[i].uri === docuri.toString()) {
      selectedPanels.push(statsPanels[i]);
    }
  }
  return selectedPanels;
}

export function updateStatisticsDocumentVersion(
  docuri: vscode.Uri,
  version: number
) {
  for (const panel of getStatisticsPanels(docuri)) {
    panel.panel.webview.postMessage({
      command: "updateversion",
      version: version,
    });
  }
}

export function removeStatisticsPanel(id: number) {
  for (let i = statsPanels.length - 1; i >= 0; i--) {
    if (statsPanels[i].id === id) {
      statsPanels.splice(i, 1);
    }
  }
}

export async function refreshPanel(
  statspanel: vscode.WebviewPanel,
  document: vscode.TextDocument,
  config: SparkScreenplayConfig
) {
  statspanel.webview.postMessage({
    command: "updateversion",
    version: document.version,
    loading: true,
  });
  const parsed = parseSpark(document.getText(), undefined, {
    removeBlockComments: true,
    skipTokens: ["condition"],
  });
  const stats = await retrieveScreenPlayStatistics(
    document.getText(),
    parsed,
    config
  );
  statspanel.webview.postMessage({
    command: "updateStats",
    content: stats,
    version: document.version,
  });
}

export function createStatisticsPanel(
  editor: vscode.TextEditor
): vscode.WebviewPanel | undefined {
  if (editor.document.languageId !== "sparkdown") {
    vscode.window.showErrorMessage(
      "You can only view statistics of Sparkdown documents!"
    );
    return undefined;
  }
  let statsPanel: vscode.WebviewPanel | undefined = undefined;
  const presentStatsPanels = getStatisticsPanels(editor.document.uri);
  presentStatsPanels.forEach((p) => {
    if (p.uri === editor.document.uri.toString()) {
      //The stats panel already exists
      p.panel.reveal();
      statsPanel = p.panel;
    }
  });

  if (!statsPanel) {
    //The stats panel didn't already exist
    const panelname = path
      .basename(editor.document.fileName)
      .replace(".sparkdown", "");
    statsPanel = vscode.window.createWebviewPanel(
      "sparkdown-statistics", // Identifies the type of the webview. Used internally
      panelname, // Title of the panel displayed to the user
      vscode.ViewColumn.Three, // Editor column to show the new webview panel in.
      { enableScripts: true }
    );
  }
  loadWebView(editor.document.uri, statsPanel);
  return statsPanel;
}

const statsHtml = fs.readFileSync(
  path.join(getDirectoryPath(), "webviews", "stats.html"),
  "utf8"
);

async function loadWebView(
  docuri: vscode.Uri,
  statspanel: vscode.WebviewPanel
) {
  const id = Date.now() + Math.floor(Math.random() * 1000);
  statsPanels.push({ uri: docuri.toString(), panel: statspanel, id: id });

  const extensionPath = vscode.extensions.getExtension(
    "impowergames.sparkdown"
  )?.extensionPath;
  if (!extensionPath) {
    return;
  }

  const cssDiskPath = vscode.Uri.file(
    path.join(
      extensionPath,
      "node_modules",
      "vscode-codicons",
      "dist",
      "codicon.css"
    )
  );
  const jsDiskPath = vscode.Uri.file(
    path.join(getDirectoryPath(), "webviews", "stats.bundle.js")
  );

  statspanel.webview.html = statsHtml
    .replace(
      "$CODICON_CSS$",
      statspanel.webview.asWebviewUri(cssDiskPath).toString()
    )
    .replace(
      "$STATSJS$",
      statspanel.webview.asWebviewUri(jsDiskPath).toString()
    );

  const config = getSparkdownConfig(docuri);
  statspanel.webview.postMessage({
    command: "setstate",
    uri: docuri.toString(),
  });
  statspanel.webview.postMessage({ command: "updateconfig", content: config });

  const activeUri = getActiveSparkdownDocument();
  if (!activeUri) {
    return;
  }

  const activeEditor = getEditor(activeUri);
  if (!activeEditor) {
    return;
  }

  const activeConfig = getSparkdownConfig(activeUri);
  if (!activeConfig) {
    return;
  }

  statspanel.webview.onDidReceiveMessage(async (message) => {
    if (message.command === "revealLine") {
      const sourceLine = message.content;
      let editor = getEditor(vscode.Uri.parse(message.uri));
      if (editor === undefined) {
        const doc = await vscode.workspace.openTextDocument(
          vscode.Uri.parse(message.uri)
        );
        editor = await vscode.window.showTextDocument(doc);
      } else {
        await vscode.window.showTextDocument(
          editor.document,
          editor.viewColumn,
          false
        );
      }
      if (editor && !Number.isNaN(sourceLine)) {
        editor.selection = new vscode.Selection(
          new vscode.Position(sourceLine, 0),
          new vscode.Position(sourceLine, 0)
        );
        editor.revealRange(
          new vscode.Range(sourceLine, 0, sourceLine + 1, 0),
          vscode.TextEditorRevealType.Default
        );
      }
    }
    if (message.command === "selectLines") {
      const startline = Math.floor(message.content.start);
      const endline = Math.floor(message.content.end);
      let editor = getEditor(vscode.Uri.parse(message.uri));
      if (!editor) {
        const doc = await vscode.workspace.openTextDocument(
          vscode.Uri.parse(message.uri)
        );
        editor = await vscode.window.showTextDocument(doc);
      } else {
        await vscode.window.showTextDocument(
          editor.document,
          editor.viewColumn,
          false
        );
      }
      if (editor && !Number.isNaN(startline) && !Number.isNaN(endline)) {
        const startpos = new vscode.Position(startline, 0);
        const endpos = new vscode.Position(
          endline,
          editor.document.lineAt(endline).text.length
        );
        editor.selection = new vscode.Selection(startpos, endpos);
        editor.revealRange(
          new vscode.Range(startpos, endpos),
          vscode.TextEditorRevealType.Default
        );
        vscode.window.showTextDocument(editor.document);
      }
    }
    if (message.command === "saveUiPersistence") {
      //save ui persistence
    }
    if (message.command === "refresh") {
      refreshPanel(statspanel, activeEditor.document, activeConfig);
    }
  });
  statspanel.onDidDispose(() => {
    removeStatisticsPanel(id);
  });

  refreshPanel(statspanel, activeEditor.document, activeConfig);
}

vscode.workspace.onDidChangeConfiguration((change) => {
  if (change.affectsConfiguration("sparkdown")) {
    statsPanels.forEach((p) => {
      const config = getSparkdownConfig(vscode.Uri.parse(p.uri));
      p.panel.webview.postMessage({ command: "updateconfig", content: config });
      p.panel.webview.postMessage({ command: "updateversion", version: -1 });
    });
  }
});

let previousCaretLine = 0;
let previousSelectionStart = 0;
let previousSelectionEnd = 0;
vscode.window.onDidChangeTextEditorSelection((change) => {
  if (change.textEditor.document.languageId === "sparkdown") {
    const selection = change.selections[0];
    statsPanels.forEach((p) => {
      if (p.uri === change.textEditor.document.uri.toString()) {
        if (selection.active.line !== previousCaretLine) {
          previousCaretLine = selection.active.line;
          p.panel.webview.postMessage({
            command: "updatecaret",
            content: selection.active.line,
            linescount: change.textEditor.document.lineCount,
            source: "click",
          });
        }
        if (
          previousSelectionStart !== selection.start.line ||
          previousSelectionEnd !== selection.end.line
        ) {
          previousSelectionStart = selection.start.line;
          previousSelectionEnd = selection.end.line;
          p.panel.webview.postMessage({
            command: "updateselection",
            content: { start: selection.start.line, end: selection.end.line },
          });
        }
      }
    });
  }
});

export class SparkdownStatsPanelSerializer
  implements vscode.WebviewPanelSerializer
{
  async deserializeWebviewPanel(
    webviewPanel: vscode.WebviewPanel,
    state: { docuri: string }
  ) {
    // `state` is the state persisted using `setState` inside the webview

    // Restore the content of our webview.
    //
    // Make sure we hold on to the `webviewPanel` passed in here and
    // also restore any event listeners we need on it.

    const docuri = vscode.Uri.parse(state.docuri);
    loadWebView(docuri, webviewPanel);
  }
}
