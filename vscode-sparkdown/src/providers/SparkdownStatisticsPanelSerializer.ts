import { SparkScreenplayConfig } from "@impower/spark-screenplay/src/index";
import * as path from "path";
import * as vscode from "vscode";
import { getEditor } from "../utils/getEditor";
import { getSparkdownPreviewConfig } from "../utils/getSparkdownPreviewConfig";
import { getWebviewUri } from "../utils/getWebviewUri";
import { readTextFile } from "../utils/readTextFile";
import { retrieveScreenPlayStatistics } from "../utils/statistics";
import { SparkProgramManager } from "./SparkProgramManager";

interface statisticsPanel {
  uri: string;
  panel: vscode.WebviewPanel;
  id: number;
}

export const statsPanels: statisticsPanel[] = [];

export function getStatisticsPanels(docuri: vscode.Uri): statisticsPanel[] {
  const selectedPanels: statisticsPanel[] = [];
  for (let i = 0; i < statsPanels.length; i++) {
    const panel = statsPanels[i];
    if (panel?.uri === docuri.toString()) {
      selectedPanels.push(panel);
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
      command: "sparkdown.updateversion",
      version: version,
    });
  }
}

export function removeStatisticsPanel(id: number) {
  for (let i = statsPanels.length - 1; i >= 0; i--) {
    const panel = statsPanels[i];
    if (panel?.id === id) {
      statsPanels.splice(i, 1);
    }
  }
}

export async function refreshPanel(
  context: vscode.ExtensionContext,
  statspanel: vscode.WebviewPanel,
  document: vscode.TextDocument,
  config: SparkScreenplayConfig
) {
  statspanel.webview.postMessage({
    command: "sparkdown.updateversion",
    version: document.version,
    loading: true,
  });
  const program = SparkProgramManager.instance.get(document.uri);
  if (program) {
    const stats = await retrieveScreenPlayStatistics(
      context,
      document.getText(),
      program,
      config
    );
    statspanel.webview.postMessage({
      command: "sparkdown.updateStats",
      content: stats,
      version: document.version,
    });
  }
}

export function createStatisticsPanel(
  editor: vscode.TextEditor,
  context: vscode.ExtensionContext
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
  loadWebView(editor.document.uri, statsPanel, context);
  return statsPanel;
}

async function loadWebView(
  docuri: vscode.Uri,
  statspanel: vscode.WebviewPanel,
  context: vscode.ExtensionContext
) {
  const id = Date.now() + Math.floor(Math.random() * 1000);
  statsPanels.push({ uri: docuri.toString(), panel: statspanel, id: id });

  const statsHtml =
    (await readTextFile(
      vscode.Uri.joinPath(context.extensionUri, "out", "webviews", `stats.html`)
    )) || "";

  const jsUriString = getWebviewUri(statspanel.webview, context.extensionUri, [
    "out",
    "webviews",
    "stats.js",
  ]).toString();

  const codiconUriString = getWebviewUri(
    statspanel.webview,
    context.extensionUri,
    ["node_modules", "@vscode/codicons", "dist", "codicon.css"]
  ).toString();

  statspanel.webview.html = statsHtml
    .replace("$CODICON_CSS$", codiconUriString)
    .replace("$STATSJS$", jsUriString);

  statspanel.webview.postMessage({
    command: "sparkdown.setstate",
    uri: docuri.toString(),
  });

  const config = getSparkdownPreviewConfig(docuri);
  statspanel.webview.postMessage({
    command: "sparkdown.updateconfig",
    content: config,
  });

  const activeEditor = getEditor(docuri);
  if (!activeEditor) {
    return;
  }

  statspanel.webview.onDidReceiveMessage(async (message) => {
    if (message.command === "sparkdown.revealLine") {
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
    if (message.command === "sparkdown.selectLines") {
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
    if (message.command === "sparkdown.saveUiPersistence") {
      //save ui persistence
    }
    if (message.command === "sparkdown.refresh") {
      refreshPanel(context, statspanel, activeEditor.document, config);
    }
  });
  statspanel.onDidDispose(() => {
    removeStatisticsPanel(id);
  });

  refreshPanel(context, statspanel, activeEditor.document, config);
}

vscode.workspace.onDidChangeConfiguration((change) => {
  if (change.affectsConfiguration("sparkdown")) {
    statsPanels.forEach((p) => {
      const config = getSparkdownPreviewConfig(vscode.Uri.parse(p.uri));
      p.panel.webview.postMessage({
        command: "sparkdown.updateconfig",
        content: config,
      });
      p.panel.webview.postMessage({
        command: "sparkdown.updateversion",
        version: -1,
      });
    });
  }
});

let previousCaretLine = 0;
let previousSelectionStart = 0;
let previousSelectionEnd = 0;
vscode.window.onDidChangeTextEditorSelection((change) => {
  if (change.textEditor.document.languageId === "sparkdown") {
    const selection = change.selections[0];
    if (selection) {
      statsPanels.forEach((p) => {
        if (p.uri === change.textEditor.document.uri.toString()) {
          if (selection.active.line !== previousCaretLine) {
            previousCaretLine = selection.active.line;
            p.panel.webview.postMessage({
              command: "sparkdown.updatecaret",
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
              command: "sparkdown.updateselection",
              content: { start: selection.start.line, end: selection.end.line },
            });
          }
        }
      });
    }
  }
});

export class SparkdownStatisticsPanelSerializer
  implements vscode.WebviewPanelSerializer
{
  context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  async deserializeWebviewPanel(
    webviewPanel: vscode.WebviewPanel,
    state: { docuri: string }
  ) {
    // `state` is the state persisted using `setState` inside the webview

    // Restore the content of our webview.
    //
    // Make sure we hold on to the `webviewPanel` passed in here and
    // also restore any event listeners we need on it.

    if (state) {
      const docuri = vscode.Uri.parse(state.docuri);
      await loadWebView(docuri, webviewPanel, this.context);
    }
  }
}
