import {
  commands,
  ExtensionContext,
  Position,
  Range,
  TextDocument,
  TextDocumentChangeEvent,
  TextEditor,
  window,
  workspace,
} from "vscode";
import { getFormatting } from "../../../packages/sparkdown-language-server/src/utils/providers/getDocumentFormattingEdits";
import { SparkdownDocumentManager } from "../managers/SparkdownDocumentManager";

type IModifier = "ctrl" | "shift";

const LIST_MARK_REGEX =
  /^(\s*)((?:[!@#$%~](?:$|\s+)|(?:[*+-](?:$|\s+))+))(.*?)$/;

export const activateAutoFormatting = (context: ExtensionContext) => {
  const activeDocument = window.activeTextEditor?.document;
  if (activeDocument?.languageId === "sparkdown") {
    SparkdownDocumentManager.instance.add(activeDocument);
  }
  context.subscriptions.push(
    workspace.onDidOpenTextDocument((data: TextDocument) => {
      SparkdownDocumentManager.instance.add(data);
    }),
    workspace.onDidChangeTextDocument((data: TextDocumentChangeEvent) => {
      SparkdownDocumentManager.instance.update(data);
    }),
    workspace.onDidCloseTextDocument((data: TextDocument) => {
      SparkdownDocumentManager.instance.remove(data);
    }),
    commands.registerCommand("sparkdown.extension.onEnterKey", onEnterKey),
    commands.registerCommand("sparkdown.extension.onCtrlEnterKey", () => {
      return onEnterKey("ctrl");
    }),
    commands.registerCommand(
      "sparkdown.extension.onBackspaceKey",
      onBackspaceKey
    )
  );

  const config = workspace.getConfiguration("sparkdown");
  if (config["editor"].autoSpaceMarks) {
    context.subscriptions.push(commands.registerCommand("type", onType));
  }
};

const getIndent = (editor: TextEditor, indentLevel: number) => {
  const tabSize =
    typeof editor.options.tabSize === "number"
      ? editor.options.tabSize
      : editor.options.tabSize?.length ?? 1;
  return editor.options.insertSpaces
    ? " ".repeat(indentLevel * tabSize)
    : "\t".repeat(indentLevel);
};

const asNormal = async (
  editor: TextEditor,
  key: "backspace" | "enter" | "tab",
  modifiers?: IModifier
) => {
  switch (key) {
    case "enter":
      if (modifiers === "ctrl") {
        await commands.executeCommand("editor.action.insertLineAfter");
      } else {
        await commands.executeCommand("default:type", {
          source: "keyboard",
          text: "\n",
        });
      }
      break;
    case "tab":
      if (modifiers === "shift") {
        await commands.executeCommand("editor.action.outdentLines");
      } else if (
        editor.selection.isEmpty &&
        workspace
          .getConfiguration("emmet")
          .get<boolean>("triggerExpansionOnTab")
      ) {
        await commands.executeCommand("editor.emmet.action.expandAbbreviation");
      } else {
        await commands.executeCommand("tab");
      }
      break;
    case "backspace":
      await commands.executeCommand("deleteLeft");
  }
  return false;
};

// The commands here are only bound to keys with `when` clause containing `editorTextFocus && !editorReadonly`. (package.json)
// So we don't need to check whether `activeTextEditor` returns `undefined` in most cases.

const onEnterKey = async (modifiers?: IModifier) => {
  const editor = window.activeTextEditor!;
  const cursor = editor.selection.active;
  const document = editor.document;
  const currentLineText = document.lineAt(cursor.line).text;
  const textBeforeCursor = currentLineText.substring(0, cursor.character);
  if (/^\s*[=]{2,}/.exec(textBeforeCursor)) {
    if (await completeKnotEndMarker(editor)) {
      return true;
    }
  }
  if (/^\s*[=](?![=])/.exec(textBeforeCursor)) {
    if (await completeStitchEndMarker(editor)) {
      return true;
    }
  }
  // TODO: Continue choices
  return asNormal(editor, "enter", modifiers);
};

const onBackspaceKey = async () => {
  const editor = window.activeTextEditor!;
  const cursor = editor.selection.active;
  const document = editor.document;
  const currentLineText = document.lineAt(cursor.line).text;
  const textBeforeCursor = currentLineText.substring(0, cursor.character);
  if (editor.selections.length === 1 && editor.selection.isEmpty) {
    if (LIST_MARK_REGEX.test(textBeforeCursor)) {
      if (await adjustStartOfLineMark(editor, "remove")) {
        return true;
      }
    }
    if (/^(\s*[=]{2,}(?:$|\s+))/.test(textBeforeCursor)) {
      if (await deleteKnot(editor)) {
        return true;
      }
    }
    if (/^(\s*[=])(?:$|\s+$)/.test(textBeforeCursor)) {
      if (await deleteStitch(editor)) {
        return true;
      }
    }
  }
  return asNormal(editor, "backspace");
};

const onType = async (
  e: { source: "keyboard"; text: string },
  ...args: any[]
) => {
  const editor = window.activeTextEditor!;

  if (e.text === "=") {
    if (await onKnotOrStitchMark(editor, e.text)) {
      return true;
    }
  }

  if (await onStartOfLineMark(editor, e.text)) {
    return true;
  }

  return commands.executeCommand("default:type", e, ...args);
};

const onStartOfLineMark = async (editor: TextEditor, mark: string) => {
  const cursor = editor.selection.active;
  const currentLineText = editor.document.lineAt(cursor.line).text;
  const textBeforeCursor =
    currentLineText.substring(0, cursor.character) + mark;

  if (editor.selections.length === 1 && editor.selection.isEmpty) {
    if (LIST_MARK_REGEX.exec(textBeforeCursor)) {
      if (await adjustStartOfLineMark(editor, "add", mark)) {
        return true;
      }
    }
  }

  return false;
};

const onKnotOrStitchMark = async (editor: TextEditor, mark: "=") => {
  const cursor = editor.selection.active;
  const currentLineText = editor.document.lineAt(cursor.line).text;
  const textBeforeCursor =
    currentLineText.substring(0, cursor.character) + mark;

  if (editor.selections.length === 1 && editor.selection.isEmpty) {
    if (/^(\s+[=])$/.exec(textBeforeCursor)) {
      if (await completeStitchStartMarker(editor, mark)) {
        return true;
      }
    }
    if (/^([=]{2,})$/.exec(textBeforeCursor)) {
      if (await completeKnotStartMarker(editor, mark)) {
        return true;
      }
    }
  }

  return false;
};

const completeKnotStartMarker = async (
  editor: TextEditor,
  typing: string = ""
): Promise<boolean> => {
  const cursor = editor.selection.active;
  const currentLineText = editor.document.lineAt(cursor.line).text;
  const currentTextBeforeCursor =
    currentLineText.slice(0, cursor.character) + typing;
  const currentTextAfterCursor = currentLineText.slice(cursor.character);
  if (!currentTextAfterCursor.trim()) {
    const matches = /^([=][=])$/.exec(currentTextBeforeCursor);
    if (matches) {
      const expectedTextBeforeCursor = "== ";
      if (currentTextBeforeCursor !== expectedTextBeforeCursor) {
        await commands.executeCommand("default:type", {
          source: "keyboard",
          text: "= ",
        });
        return true;
      }
    }
  }
  return false;
};

const completeStitchStartMarker = async (
  editor: TextEditor,
  typing: string = ""
): Promise<boolean> => {
  const cursor = editor.selection.active;
  const currentLineText = editor.document.lineAt(cursor.line).text;
  const currentTextBeforeCursor =
    currentLineText.slice(0, cursor.character) + typing;
  const currentTextAfterCursor = currentLineText.slice(cursor.character);
  if (!currentTextAfterCursor.trim()) {
    const matches = /^(\s+)([=])$/.exec(currentTextBeforeCursor);
    if (matches) {
      const expectedTextBeforeCursor = "= ";
      if (currentTextBeforeCursor !== expectedTextBeforeCursor) {
        await commands.executeCommand("default:type", {
          source: "keyboard",
          text: "= ",
        });
        return true;
      }
    }
  }
  return false;
};

const completeKnotEndMarker = async (editor: TextEditor): Promise<boolean> => {
  const cursor = editor.selection.active;
  const currentLineText = editor.document.lineAt(cursor.line).text;
  const currentTextBeforeCursor = currentLineText.slice(0, cursor.character);
  const currentTextAfterCursor = currentLineText.slice(cursor.character);
  if (!currentTextAfterCursor.trim()) {
    const matches = /^(\s*)([=]{2,})(.*?)($|[=]{2,})/.exec(currentLineText);
    if (matches) {
      const marksBefore = matches?.[2] || "==";
      const name = (matches[3] || "").trim();
      const expectedText = marksBefore + " " + name + " " + marksBefore;
      if (expectedText !== matches[0]) {
        editor.edit(
          (editBuilder) => {
            if (expectedText.startsWith(currentTextBeforeCursor)) {
              const insertText = expectedText.slice(
                currentTextBeforeCursor.length
              );
              editBuilder.insert(
                new Position(cursor.line, currentTextBeforeCursor.length),
                insertText
              );
            } else {
              editBuilder.replace(
                new Range(cursor.line, 0, cursor.line, matches[0].length),
                expectedText
              );
            }
          },
          {
            undoStopBefore: false,
            undoStopAfter: false,
          }
        );
      }
      return false;
    }
  }
  return false;
};

const completeStitchEndMarker = async (
  editor: TextEditor
): Promise<boolean> => {
  const cursor = editor.selection.active;
  const currentLineText = editor.document.lineAt(cursor.line).text;
  const currentTextAfterCursor = currentLineText.slice(cursor.character);
  if (!currentTextAfterCursor.trim()) {
    const matches = /^(\s*)([=])(.*?)$/.exec(currentLineText);
    if (matches) {
      const marksBefore = matches?.[2] || "==";
      const name = (matches[3] || "").trim();
      const expectedText = getIndent(editor, 1) + marksBefore + " " + name;
      if (expectedText !== matches[0]) {
        editor.edit(
          (editBuilder) => {
            editBuilder.replace(
              new Range(cursor.line, 0, cursor.line, matches[0].length),
              expectedText
            );
          },
          {
            undoStopBefore: false,
            undoStopAfter: false,
          }
        );
      }
      return false;
    }
  }
  return false;
};

const deleteKnot = async (editor: TextEditor): Promise<boolean> => {
  const cursor = editor.selection.active;
  const currentLineText = editor.document.lineAt(cursor.line).text;
  // TODO: iterate over references to adjust indents ahead.
  // (until we reach a line with expectedIndentLevel == 0)
  const matches = /^(\s*)([=]{2,}\s*)(?:(.*?)((?<!\s)\s*(?:[=]+)?)?)$/.exec(
    currentLineText
  );
  if (matches) {
    const indent = matches[1] || "";
    const startMark = matches[2] || "";
    const name = matches[3] || "";
    const endMark = matches[4] || "";
    if (name && endMark) {
      const expectedText = indent + startMark + name;
      await editor.edit(
        (editBuilder) => {
          editBuilder.replace(
            new Range(
              cursor.line,
              expectedText.length,
              cursor.line,
              matches[0].length
            ),
            ""
          );
        },
        { undoStopBefore: false, undoStopAfter: false }
      );
      return true;
    } else if (!name) {
      await editor.edit(
        (editBuilder) => {
          editBuilder.replace(
            new Range(
              cursor.line,
              indent.length,
              cursor.line,
              matches[0].length
            ),
            ""
          );
        },
        { undoStopBefore: false, undoStopAfter: false }
      );
      return true;
    }
  }
  return false;
};

const deleteStitch = async (editor: TextEditor): Promise<boolean> => {
  const cursor = editor.selection.active;
  const currentLineText = editor.document.lineAt(cursor.line).text;
  const currentTextBeforeCursor = currentLineText.slice(0, cursor.character);
  // TODO: iterate over references to adjust indents ahead.
  // (until we reach a line with expectedIndentLevel == 0)
  const matches = /^(\s*)([=])($|\s+$)/.exec(currentTextBeforeCursor);
  if (matches) {
    const indent = matches[1] || "";
    await editor.edit(
      (editBuilder) => {
        editBuilder.replace(
          new Range(cursor.line, indent.length, cursor.line, matches[0].length),
          ""
        );
      },
      { undoStopBefore: false, undoStopAfter: false }
    );
    return true;
  }
  return false;
};

const adjustStartOfLineMark = async (
  editor: TextEditor,
  action: "add" | "remove",
  typing: string = ""
): Promise<boolean> => {
  const cursor = editor.selection.active;
  const currentLineText = editor.document.lineAt(cursor.line).text;
  const textBeforeCursor = currentLineText.substring(0, cursor.character);
  const currentText = textBeforeCursor + typing;
  let matches = LIST_MARK_REGEX.exec(currentText);
  const afterMarkText = matches?.[3]?.trim();
  if (matches && !afterMarkText) {
    const parsedDoc = SparkdownDocumentManager.instance.get(
      editor.document.uri
    );
    const tree = SparkdownDocumentManager.instance.tree(editor.document.uri);
    const annotations = SparkdownDocumentManager.instance.annotations(
      editor.document.uri
    );
    const { indentStack } = getFormatting(
      parsedDoc,
      tree,
      annotations,
      {
        tabSize: editor.options.tabSize as number,
        insertSpaces: editor.options.insertSpaces as boolean,
      },
      new Range(
        0,
        0,
        cursor.line - 1,
        editor.document.lineAt(cursor.line - 1).text.length
      )
    );
    const expectedIndentStack = [...(indentStack || [])];
    const currentIndent = expectedIndentStack.at(-1);
    const currentIndentLevel = currentIndent?.level ?? 0;
    const markers = matches?.[2] || "";
    const marks = markers.split(/[ \t]+/).filter((m) => Boolean(m));
    const adjustedMarks = action === "remove" ? marks.slice(0, -1) : marks;
    const adjustedMarkers =
      adjustedMarks.length > 0
        ? adjustedMarks.join(" ") + " "
        : currentIndentLevel > 0
        ? "  "
        : "";
    const indentOffset =
      adjustedMarks.length - (currentIndent?.marks?.length ?? 0) - 1;
    const newIndentLevel = currentIndentLevel + indentOffset;
    const expectedLevel = Math.max(0, newIndentLevel);
    const expectedText = getIndent(editor, expectedLevel) + adjustedMarkers;
    if (action === "add" && expectedText.startsWith(currentText)) {
      const insertText = expectedText.slice(textBeforeCursor.length);
      await commands.executeCommand("default:type", {
        source: "keyboard",
        text: insertText,
      });
      return true;
    } else if (
      action === "remove" &&
      textBeforeCursor.startsWith(expectedText)
    ) {
      await editor.edit(
        (editBuilder) => {
          editBuilder.delete(
            new Range(
              cursor.line,
              expectedText.length,
              cursor.line,
              currentText.length
            )
          );
        },
        { undoStopBefore: false, undoStopAfter: false }
      );
      return true;
    } else {
      await editor.edit(
        (editBuilder) => {
          editBuilder.replace(
            new Range(cursor.line, 0, cursor.line, currentText.length),
            expectedText
          );
        },
        { undoStopBefore: false, undoStopAfter: false }
      );
      return true;
    }
  }
  return false;
};
