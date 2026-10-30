import * as vscode from "vscode";
import { CompletionPreviewTracker } from "../completion/CompletionPreviewTracker";
import {
  type CompletionCandidate,
  type Cursor,
  type Placement,
  sameChanges,
} from "../completion/completionEdits";
import { SparkdownPreviewGamePanelManager } from "../managers/SparkdownPreviewGamePanelManager";
import { getServerRange } from "./getServerRange";

const tracker = new CompletionPreviewTracker((params) => {
  SparkdownPreviewGamePanelManager.instance.notifyPreviewCompletion(params);
  if (params.state === "focus") {
    askWhileOpen();
  }
});

// workaround(vscode): stops querying inline providers when the editor loses focus and has no public event for it, so the highlight is polled
const ASK_WHILE_OPEN_MS = 500;
let asking: ReturnType<typeof setInterval> | undefined;
const askWhileOpen = () => {
  if (asking) {
    return;
  }
  asking = setInterval(() => {
    if (!tracker.open || !previewing()) {
      clearInterval(asking);
      asking = undefined;
      return;
    }
    void vscode.commands.executeCommand("editor.action.inlineSuggest.trigger");
  }, ASK_WHILE_OPEN_MS);
};

let offered: {
  uri: string;
  items: vscode.CompletionItem[];
} | null = null;

const candidateOf = (item: vscode.CompletionItem): CompletionCandidate => {
  const range = item.range;
  const start = range
    ? "start" in range
      ? range.start
      : range.inserting.start
    : undefined;
  const insert =
    item.insertText ??
    (typeof item.label === "string" ? item.label : item.label.label);
  const snippet = insert instanceof vscode.SnippetString;
  return {
    start: start ? { line: start.line, character: start.character } : undefined,
    text: snippet ? insert.value : (insert as string),
    snippet,
    keepWhitespace: item.keepWhitespace === true,
    additionalEdits: (item.additionalTextEdits ?? []).map((edit) => ({
      range: getServerRange(edit.range),
      text: edit.newText,
    })),
  };
};

const previewing = () =>
  SparkdownPreviewGamePanelManager.instance.canPreviewCompletions;

export const offerCompletions = (
  document: vscode.TextDocument,
  result: vscode.CompletionItem[] | vscode.CompletionList | null | undefined,
) => {
  if (!previewing()) {
    return;
  }
  const items = !result ? [] : Array.isArray(result) ? result : result.items;
  const uri = document.uri.toString();
  offered = { uri, items: [...items] };
  tracker.offered(uri, items.map(candidateOf));
  const editor = vscode.window.activeTextEditor;
  if (items.length > 0 && editor?.document === document) {
    void vscode.commands.executeCommand("editor.action.inlineSuggest.trigger");
  }
};

export const resolvedCompletion = (
  original: vscode.CompletionItem,
  resolved: vscode.CompletionItem | null | undefined,
) => {
  if (!offered || !resolved || resolved === original) {
    return;
  }
  const index = offered.items.indexOf(original);
  if (index < 0) {
    return;
  }
  if (
    sameChanges(
      candidateOf(resolved).additionalEdits,
      candidateOf(original).additionalEdits,
    )
  ) {
    return;
  }
  offered.items[index] = resolved;
  tracker.offered(offered.uri, offered.items.map(candidateOf));
};

const cursorOf = (selection: vscode.Selection): Cursor => ({
  anchor: {
    line: selection.anchor.line,
    character: selection.anchor.character,
  },
  active: {
    line: selection.active.line,
    character: selection.active.character,
  },
});

const placementIn = (
  document: vscode.TextDocument,
  position: vscode.Position,
): Placement => {
  const editor = vscode.window.visibleTextEditors.find(
    (e) => e.document === document && e.selection.active.isEqual(position),
  );
  const at = { line: position.line, character: position.character };
  const [primary, ...others] = editor?.selections ?? [];
  const { tabSize, indentSize, insertSpaces } = editor?.options ?? {};
  return {
    primary: primary ? cursorOf(primary) : { anchor: at, active: at },
    others: others.map(cursorOf),
    lineText: (line) => document.lineAt(line).text,
    indentSize:
      typeof indentSize === "number"
        ? indentSize
        : typeof tabSize === "number"
          ? tabSize
          : 4,
    insertSpaces: typeof insertSpaces === "boolean" ? insertSpaces : true,
    eol: document.eol === vscode.EndOfLine.CRLF ? "\r\n" : "\n",
  };
};

export const activateCompletionPreview = (context: vscode.ExtensionContext) => {
  context.subscriptions.push(
    vscode.languages.registerInlineCompletionItemProvider(
      { language: "sparkdown" },
      {
        provideInlineCompletionItems: (document, position, inlineContext) => {
          if (!previewing()) {
            tracker.reset();
            return [];
          }
          const info = inlineContext.selectedCompletionInfo;
          tracker.observed(
            document.uri.toString(),
            document.version,
            placementIn(document, position),
            info
              ? { range: getServerRange(info.range), text: info.text }
              : undefined,
          );
          return [];
        },
      },
    ),
  );
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((change) => {
      tracker.changed(
        change.document.uri.toString(),
        change.document.version,
        change.contentChanges.map((c) => ({
          range: getServerRange(c.range),
          text: c.text,
        })),
      );
    }),
  );
  let activeUri = vscode.window.activeTextEditor?.document.uri.toString();
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      const uri = editor?.document.uri.toString();
      if (activeUri && activeUri !== uri) {
        tracker.left(activeUri, null);
      }
      activeUri = uri;
    }),
  );
  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument((document) => {
      tracker.left(document.uri.toString(), null);
    }),
  );
  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection((change) => {
      if (change.kind === vscode.TextEditorSelectionChangeKind.Mouse) {
        tracker.left(
          change.textEditor.document.uri.toString(),
          change.textEditor.document.version,
        );
      }
    }),
  );
  context.subscriptions.push({
    dispose: () => {
      clearInterval(asking);
      asking = undefined;
    },
  });
  context.subscriptions.push(
    SparkdownPreviewGamePanelManager.instance.onDidDisposePanel(() => {
      tracker.reset();
      offered = null;
    }),
  );
  context.subscriptions.push(
    SparkdownPreviewGamePanelManager.instance.onDidConnectPanel(() => {
      tracker.resend();
    }),
  );
};
