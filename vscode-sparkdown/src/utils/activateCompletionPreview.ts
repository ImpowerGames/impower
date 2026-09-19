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

/**
 * Shows the highlighted suggestion of VS Code's own suggestion list in the Game
 * Preview, and the real document again when the list closes.
 *
 * VS Code reports the highlighted suggestion to inline completion providers
 * (`InlineCompletionContext.selectedCompletionInfo`), but only while its inline
 * completion model is active, and it only activates that model for an editor
 * where inline suggestions were asked for. So whenever the language server
 * answers a request for suggestions while a Game Preview is open, the
 * extension asks for inline suggestions with the public
 * `editor.action.inlineSuggest.trigger` command; the provider registered here
 * then hears of every highlight and of the list closing. It never returns an
 * inline suggestion, so nothing is shown or inserted inline, and it changes no
 * setting: the model is active for this purpose whether or not
 * `editor.inlineSuggest.enabled` is on.
 *
 * The extension requires VS Code 1.100 because earlier versions answer a
 * request with nothing highlighted from their cache when one was answered at
 * the same cursor and document version, so a second Escape at the same place
 * never reaches the provider and the preview cannot return to the document.
 */
const tracker = new CompletionPreviewTracker((params) => {
  SparkdownPreviewGamePanelManager.instance.notifyPreviewCompletion(params);
  if (params.state === "focus") {
    askWhileOpen();
  }
});

/**
 * How often, while a list is open, VS Code is asked again which suggestion is
 * highlighted. A list closed by Escape, by accepting or by a change of editor
 * is reported at once; one closed because the editor lost focus (a click in
 * the Explorer, the Command Palette, the terminal) is not, because VS Code
 * stops asking inline providers when its editor loses focus and has no public
 * event for that. Asking again reaches the editor even then, and it answers
 * that nothing is highlighted. While the list stays open it answers with the
 * highlight already reported, which sends nothing.
 */
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

/** The language server's items for the latest request, kept so an item it
 *  resolves later can replace the one it was offered as. */
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

/** Whether the list's highlights should reach a preview at all: one is open,
 *  connected and not playing. */
const previewing = () =>
  SparkdownPreviewGamePanelManager.instance.canPreviewCompletions;

/**
 * The language server answered a request for suggestions in `document`.
 * Records its items for working out each highlight's edit, and makes sure
 * VS Code reports the highlights of the list about to open.
 */
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
  // Asking for inline suggestions asks every extension that offers them, so
  // it is done only when this answer puts suggestions in a list.
  if (items.length > 0 && editor?.document === document) {
    void vscode.commands.executeCommand("editor.action.inlineSuggest.trigger");
  }
};

/**
 * The language server resolved `item`, one of the items it offered. When
 * resolving added edits the item did not carry when offered, they are part of
 * what accepting it does.
 */
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

/** Where a suggestion in `document` would be accepted: the cursors of the
 *  editor whose primary cursor is at `position`, and that editor's
 *  indentation and the document's line breaks. */
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
    // VS Code normalizes inserted indentation by the indent size, which
    // follows the tab size unless set on its own.
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
        // A click in the text closes the list.
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
      // A reloaded preview has a fresh player that has seen nothing.
      tracker.resend();
    }),
  );
};
