import { SparkParseResult } from "@impower/sparkdown/src/index";
import * as vscode from "vscode";

export const last = function <T>(array: T[]): T {
  return array[array.length - 1] as T;
};

/** Shifts scene/s at the selected text up or down */
export const shiftScenes = (
  editor: vscode.TextEditor,
  parsed: SparkParseResult,
  direction: number
) => {
  let numNewlinesAtEndRequired = 0;
  const selectSceneAt = (
    sel: vscode.Selection
  ): vscode.Selection | undefined => {
    // returns range that contains whole scenes that overlap with the selection
    const headingsBefore = parsed.tokens
      .filter(
        (token) =>
          (token.type === "scene" || token.type === "section") &&
          token.line <= sel.active.line &&
          token.line <= sel.anchor.line
      )
      .sort((a, b) => b.line - a.line);
    const headingsAfter = parsed.tokens
      .filter(
        (token) =>
          (token.type === "scene" || token.type === "section") &&
          token.line > sel.active.line &&
          token.line > sel.anchor.line
      )
      .sort((a, b) => a.line - b.line);

    if (headingsBefore.length === 0) {
      return undefined;
    }
    const selStart = +(headingsBefore[0]?.line || 0);

    if (headingsAfter.length) {
      const selEnd = +(headingsAfter[0]?.line || 0);
      return new vscode.Selection(selStart, 0, selEnd, 0);
    } else {
      // +2 is where the next scene would start if there was one. done to make it look consistent.
      const selEnd = last(parsed.tokens.filter((token) => token.line)).line + 2;
      if (selEnd >= editor.document.lineCount) {
        numNewlinesAtEndRequired = selEnd - editor.document.lineCount + 1;
      }
      return new vscode.Selection(selStart, 0, selEnd, 0);
    }
  };

  // get range of scene/s that are shifting
  const moveSelection = selectSceneAt(editor.selection);
  if (!moveSelection) {
    return;
  } // edge case: using command before the first scene
  const moveText =
    editor.document.getText(moveSelection) +
    new Array(numNewlinesAtEndRequired + 1).join("\n");
  numNewlinesAtEndRequired = 0;

  // get range of scene being swapped with selected scene/s
  const aboveSelection =
    direction === -1 &&
    selectSceneAt(
      new vscode.Selection(
        moveSelection.anchor.line - 1,
        0,
        moveSelection.anchor.line - 1,
        0
      )
    );
  const belowSelection =
    direction === 1 &&
    selectSceneAt(
      new vscode.Selection(
        moveSelection.active.line + 1,
        0,
        moveSelection.active.line + 1,
        0
      )
    );

  // edge cases: no scenes above or below to swap with
  if (!belowSelection && !aboveSelection) {
    return;
  }
  if (
    belowSelection &&
    belowSelection.anchor.line < moveSelection.active.line
  ) {
    return;
  }

  let reselectDelta = 0;
  const newLinePos = editor.document.lineAt(editor.document.lineCount - 1).range
    .end;

  editor.edit((editBuilder) => {
    // going bottom-up to avoid re-aligning line numbers

    // might need empty lines at the bottom so the cut-paste behaves the same as if there were more scenes
    while (numNewlinesAtEndRequired) {
      // vscode makes this \r\n when appropriate
      editBuilder.insert(newLinePos, "\n");
      numNewlinesAtEndRequired--;
    }

    // paste below?
    if (belowSelection) {
      editBuilder.insert(
        new vscode.Position(belowSelection.active.line, 0),
        moveText
      );
      reselectDelta = belowSelection.active.line - belowSelection.anchor.line;
    }

    if (moveSelection) {
      // delete original
      editBuilder.delete(moveSelection);
    }

    // paste above?
    if (aboveSelection) {
      editBuilder.insert(
        new vscode.Position(aboveSelection.anchor.line, 0),
        moveText
      );
      reselectDelta =
        aboveSelection.anchor.line - (moveSelection?.anchor?.line || 0);
    }
  });

  // reselect any text that was originally selected / cursor position
  editor.selection = new vscode.Selection(
    editor.selection.anchor.translate(reselectDelta),
    editor.selection.active.translate(reselectDelta)
  );
  editor.revealRange(editor.selection);
};
