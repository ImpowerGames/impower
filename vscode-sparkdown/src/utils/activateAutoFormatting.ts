/*
 * Based on vscode-markdown <https://github.com/yzhang-gh/vscode-markdown>
 *
 * Copyright (c) 2017 张宇
 * Released under the MIT license.
 */

import { SparkdownNodeName } from "@impower/sparkdown/src/types/SparkdownNodeName";
import {
  commands,
  ExtensionContext,
  Position,
  Range,
  Selection,
  SnippetString,
  TextDocument,
  TextDocumentChangeEvent,
  TextEditor,
  window,
  workspace,
  WorkspaceEdit,
} from "vscode";
import { getStack } from "../../../packages/textmate-grammar-tree/src/tree/utils/getStack";
import { SparkdownDocumentManager } from "../managers/SparkdownDocumentManager";

enum EmphasisType {
  ITALIC = "*",
  BOLD = "**",
  UNDERLINE = "_",
  CENTER = "^",
  WAVY = "~~",
  SHAKY = "::",
}
type IModifier = "ctrl" | "shift";

export const activateAutoFormatting = (context: ExtensionContext) => {
  const activeDocument = window.activeTextEditor?.document;
  if (activeDocument?.languageId === "sparkdown") {
    SparkdownDocumentManager.instance.add(activeDocument);
  }
  context.subscriptions.push(
    workspace.onDidOpenTextDocument((data: TextDocument) => {
      if (data.languageId === "sparkdown") {
        SparkdownDocumentManager.instance.add(data);
      }
    }),
    workspace.onDidChangeTextDocument((data: TextDocumentChangeEvent) => {
      if (data.languageId === "sparkdown") {
        SparkdownDocumentManager.instance.update(data);
      }
    }),
    workspace.onDidCloseTextDocument((data: TextDocument) => {
      if (data.languageId === "sparkdown") {
        SparkdownDocumentManager.instance.remove(data);
      }
    }),
    commands.registerCommand("sparkdown.extension.onEnterKey", onEnterKey),
    commands.registerCommand("sparkdown.extension.onCtrlEnterKey", () => {
      return onEnterKey("ctrl");
    }),
    commands.registerCommand(
      "sparkdown.extension.onBackspaceKey",
      onBackspaceKey
    ),
    commands.registerCommand("sparkdown.extension.editing.toggleBold", () =>
      toggleEmphasis(EmphasisType.BOLD)
    ),
    commands.registerCommand("sparkdown.extension.editing.toggleItalic", () =>
      toggleEmphasis(EmphasisType.ITALIC)
    ),
    commands.registerCommand(
      "sparkdown.extension.editing.toggleItalicAsterisk",
      () => toggleEmphasis(EmphasisType.ITALIC)
    ),
    commands.registerCommand(
      "sparkdown.extension.editing.toggleUnderline",
      () => toggleEmphasis(EmphasisType.UNDERLINE)
    ),
    commands.registerCommand("sparkdown.extension.editing.toggleCenter", () =>
      toggleEmphasis(EmphasisType.CENTER)
    ),
    commands.registerCommand("sparkdown.extension.editing.toggleWavy", () =>
      toggleEmphasis(EmphasisType.WAVY)
    ),
    commands.registerCommand("sparkdown.extension.editing.toggleShaky", () =>
      toggleEmphasis(EmphasisType.SHAKY)
    )
  );

  const config = workspace.getConfiguration("sparkdown");
  if (config["editor"].autoCloseAngleBrackets) {
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
  const textAfterCursor = currentLineText.substring(cursor.character);
  if (editor.selections.length === 1 && editor.selection.isEmpty) {
    if (/([<])$/.test(textBeforeCursor) && /^([>])/.test(textAfterCursor)) {
      if (await deleteAngleBrackets(editor)) {
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

  if (e.text === "<") {
    if (await onOpenAngleBracket(editor)) {
      return true;
    }
  }

  return commands.executeCommand("default:type", e, ...args);
};

const onOpenAngleBracket = async (editor: TextEditor) => {
  const cursor = editor.selection.active;
  const currentLineText = editor.document.lineAt(cursor.line).text;
  const textAfterCursor = currentLineText.substring(cursor.character);
  if (editor.selections.length === 1 && editor.selection.isEmpty) {
    if (!textAfterCursor?.trim()) {
      if (
        workspace.getConfiguration("sparkdown")["editor"].autoCloseAngleBrackets
      ) {
        if (await closeAngleBracket(editor)) {
          return true;
        }
      }
    }
  }

  return false;
};

const closeAngleBracket = async (editor: TextEditor): Promise<boolean> => {
  const cursor = editor.selection.active;
  const parsedDoc = SparkdownDocumentManager.instance.get(editor.document.uri);
  const tree = SparkdownDocumentManager.instance.tree(editor.document.uri);

  if (!parsedDoc || !tree) {
    [];
    return false;
  }

  const stack = getStack<SparkdownNodeName>(
    tree,
    parsedDoc.offsetAt(cursor),
    -1
  );

  console.log(stack.map((n) => n.name));

  if (
    !stack.some(
      (n) =>
        n.name === "TextChunk" ||
        n.name === "Action" ||
        n.name === "Scene" ||
        n.name === "Transition" ||
        n.name === "BlockDialogue" ||
        n.name === "InlineDialogue" ||
        n.name === "BlockWrite" ||
        n.name === "InlineWrite"
    )
  ) {
    return false;
  }

  await editor.insertSnippet(new SnippetString("<$0>"), cursor, {
    undoStopBefore: true,
    undoStopAfter: true,
  });

  return true;
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

const deleteAngleBrackets = async (editor: TextEditor): Promise<boolean> => {
  const cursor = editor.selection.active;
  await editor.edit(
    (editBuilder) => {
      editBuilder.replace(
        new Range(
          cursor.line,
          cursor.character - 1,
          cursor.line,
          cursor.character + 1
        ),
        ""
      );
    },
    { undoStopBefore: false, undoStopAfter: false }
  );
  return true;
};

const toggleEmphasis = (type: EmphasisType) => {
  const editor = window.activeTextEditor;
  if (editor) {
    let indicator = String(type);
    return styleByWrapping(indicator);
  }
  return false;
};

// Read PR #1052 before touching this please!
const styleByWrapping = (startPattern: string, endPattern = startPattern) => {
  const editor = window.activeTextEditor!;
  let selections = editor.selections;

  let batchEdit = new WorkspaceEdit();
  let shifts: [Position, number][] = [];
  let newSelections: Selection[] = selections.slice();

  for (const [i, selection] of selections.entries()) {
    let cursorPos = selection.active;
    const shift = shifts
      .map(([pos, s]) =>
        selection.start.line == pos.line &&
        selection.start.character >= pos.character
          ? s
          : 0
      )
      .reduce((a, b) => a + b, 0);

    if (selection.isEmpty) {
      const context = getContext(editor, cursorPos, startPattern, endPattern);

      // No selected text
      if (
        startPattern === endPattern &&
        Object.values(EmphasisType)
          .map((e) => String(e))
          .includes(startPattern) &&
        context === `${startPattern}text|${endPattern}`
      ) {
        // `**text|**` to `**text**|`
        let newCursorPos = cursorPos.with({
          character: cursorPos.character + shift + endPattern.length,
        });
        newSelections[i] = new Selection(newCursorPos, newCursorPos);
        continue;
      } else if (context === `${startPattern}|${endPattern}`) {
        // `**|**` to `|`
        let start = cursorPos.with({
          character: cursorPos.character - startPattern.length,
        });
        let end = cursorPos.with({
          character: cursorPos.character + endPattern.length,
        });
        wrapRange(
          editor,
          batchEdit,
          shifts,
          newSelections,
          i,
          shift,
          cursorPos,
          new Range(start, end),
          false,
          startPattern,
          endPattern
        );
      } else {
        // Select word under cursor
        let wordRange = editor.document.getWordRangeAtPosition(cursorPos);
        if (wordRange == undefined) {
          wordRange = selection;
        }
        wrapRange(
          editor,
          batchEdit,
          shifts,
          newSelections,
          i,
          shift,
          cursorPos,
          wordRange,
          false,
          startPattern,
          endPattern
        );
      }
    } else {
      // Text selected
      wrapRange(
        editor,
        batchEdit,
        shifts,
        newSelections,
        i,
        shift,
        cursorPos,
        selection,
        true,
        startPattern,
        endPattern
      );
    }
  }

  return workspace.applyEdit(batchEdit).then(() => {
    editor.selections = newSelections;
  });
};

/**
 * Add or remove `startPattern`/`endPattern` according to the context
 * @param editor
 * @param options The undo/redo behavior
 * @param cursor cursor position
 * @param range range to be replaced
 * @param isSelected is this range selected
 * @param startPtn
 * @param endPtn
 */
const wrapRange = (
  editor: TextEditor,
  wsEdit: WorkspaceEdit,
  shifts: [Position, number][],
  newSelections: Selection[],
  i: number,
  shift: number,
  cursor: Position,
  range: Range,
  isSelected: boolean,
  startPtn: string,
  endPtn: string
) => {
  let text = editor.document.getText(range);
  const prevSelection = newSelections[i];
  const ptnLength = (startPtn + endPtn).length;

  let newCursorPos = cursor.with({ character: cursor.character + shift });
  let newSelection: Selection | undefined = undefined;
  if (isWrapped(text, startPtn, endPtn)) {
    // remove start/end patterns from range
    wsEdit.replace(
      editor.document.uri,
      range,
      text.substr(startPtn.length, text.length - ptnLength)
    );

    shifts.push([range.end, -ptnLength]);

    // Fix cursor position
    if (!isSelected) {
      if (!range.isEmpty) {
        // means quick styling
        if (cursor.character == range.end.character) {
          newCursorPos = cursor.with({
            character: cursor.character + shift - ptnLength,
          });
        } else {
          newCursorPos = cursor.with({
            character: cursor.character + shift - startPtn.length,
          });
        }
      } else {
        // means `**|**` -> `|`
        newCursorPos = cursor.with({
          character: cursor.character + shift + startPtn.length,
        });
      }
      newSelection = new Selection(newCursorPos, newCursorPos);
    } else if (prevSelection) {
      newSelection = new Selection(
        prevSelection.start.with({
          character: prevSelection.start.character + shift,
        }),
        prevSelection.end.with({
          character: prevSelection.end.character + shift - ptnLength,
        })
      );
    }
  } else {
    // add start/end patterns around range
    wsEdit.replace(editor.document.uri, range, startPtn + text + endPtn);

    shifts.push([range.end, ptnLength]);

    // Fix cursor position
    if (!isSelected) {
      if (!range.isEmpty) {
        // means quick styling
        if (cursor.character == range.end.character) {
          newCursorPos = cursor.with({
            character: cursor.character + shift + ptnLength,
          });
        } else {
          newCursorPos = cursor.with({
            character: cursor.character + shift + startPtn.length,
          });
        }
      } else {
        // means `|` -> `**|**`
        newCursorPos = cursor.with({
          character: cursor.character + shift + startPtn.length,
        });
      }
      newSelection = new Selection(newCursorPos, newCursorPos);
    } else if (prevSelection) {
      newSelection = new Selection(
        prevSelection.start.with({
          character: prevSelection.start.character + shift,
        }),
        prevSelection.end.with({
          character: prevSelection.end.character + shift + ptnLength,
        })
      );
    }
  }
  if (newSelection) {
    newSelections[i] = newSelection;
  }
};

const isWrapped = (
  text: string,
  startPattern: string,
  endPattern: string
): boolean => {
  return text.startsWith(startPattern) && text.endsWith(endPattern);
};

const getContext = (
  editor: TextEditor,
  cursorPos: Position,
  startPattern: string,
  endPattern: string
): string => {
  let startPositionCharacter = cursorPos.character - startPattern.length;
  let endPositionCharacter = cursorPos.character + endPattern.length;

  if (startPositionCharacter < 0) {
    startPositionCharacter = 0;
  }

  let leftText = editor.document.getText(
    new Range(
      cursorPos.line,
      startPositionCharacter,
      cursorPos.line,
      cursorPos.character
    )
  );
  let rightText = editor.document.getText(
    new Range(
      cursorPos.line,
      cursorPos.character,
      cursorPos.line,
      endPositionCharacter
    )
  );

  if (rightText == endPattern) {
    if (leftText == startPattern) {
      return `${startPattern}|${endPattern}`;
    } else {
      return `${startPattern}text|${endPattern}`;
    }
  }
  return "|";
};
