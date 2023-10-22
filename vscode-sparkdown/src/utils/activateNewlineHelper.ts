import * as vscode from "vscode";
import GRAMMAR from "../../language/sparkdown.language-grammar.json";
import { getActiveSparkdownDocument } from "./getActiveSparkdownDocument";
import { getSparkdownPreviewConfig } from "./getSparkdownPreviewConfig";

const SNIPPET_CURSOR = "$0";

const DEFINE_BEGIN_REGEX = new RegExp(
  GRAMMAR.repository.Define.begin,
  GRAMMAR.flags
);
const DIALOGUE_BEGIN_MATCH = new RegExp(
  GRAMMAR.repository.Dialogue.begin,
  GRAMMAR.flags
);
const CHOICE_BEGIN_REGEX = new RegExp(
  GRAMMAR.repository.Choice.match,
  GRAMMAR.flags
);
const END_MATCH_REGEX = new RegExp(GRAMMAR.repository.End.match, GRAMMAR.flags);

const handleNewline = (args: { text: string }): boolean => {
  const editor = vscode.window.activeTextEditor;

  if (!editor || !editor.selection.isEmpty || args.text !== "\n") {
    return false;
  }

  const position = editor.selection.active;
  const lineText = editor.document.getText(
    new vscode.Range(
      new vscode.Position(position.line, 0),
      new vscode.Position(position.line, Number.MAX_SAFE_INTEGER)
    )
  );
  const textAfterCursor = lineText.slice(position.character);
  const tabSize = Number(editor.options.tabSize);
  const indent = " ".repeat(tabSize);

  let match: RegExpMatchArray | null = null;

  if ((match = lineText.match(DIALOGUE_BEGIN_MATCH))) {
    if (!textAfterCursor) {
      const listPrefix = match.slice(1, 3).join("");
      if (listPrefix.trim()) {
        const textAfterMark = lineText.slice(listPrefix.length);
        if (textAfterMark.trim()) {
          // Continue list
          editor.insertSnippet(
            new vscode.SnippetString("\n" + listPrefix + SNIPPET_CURSOR)
          );
          return true;
        } else {
          // Delete empty dialogue marks on enter
          editor.insertSnippet(
            new vscode.SnippetString(""),
            new vscode.Range(
              new vscode.Position(position.line, 0),
              new vscode.Position(position.line, Number.MAX_SAFE_INTEGER)
            )
          );
          return true;
        }
      }
    }
  }

  if ((match = lineText.match(CHOICE_BEGIN_REGEX))) {
    if (!textAfterCursor) {
      const listPrefix = match.slice(1, 3).join("");
      if (listPrefix.trim()) {
        const textAfterMark = lineText.slice(listPrefix.length);
        if (textAfterMark.trim()) {
          // Continue list
          editor.insertSnippet(
            new vscode.SnippetString("\n" + listPrefix + SNIPPET_CURSOR)
          );
          return true;
        } else {
          // Delete empty dialogue marks on enter
          editor.insertSnippet(
            new vscode.SnippetString(""),
            new vscode.Range(
              new vscode.Position(position.line, 0),
              new vscode.Position(position.line, Number.MAX_SAFE_INTEGER)
            )
          );
          return true;
        }
      }
    }
  }

  if (DEFINE_BEGIN_REGEX.test(lineText)) {
    // Auto-close define statements on enter
    if (!textAfterCursor) {
      editor.insertSnippet(
        new vscode.SnippetString("\n" + indent + SNIPPET_CURSOR + "\n" + "end")
      );
      return true;
    } else if (END_MATCH_REGEX.test(textAfterCursor)) {
      editor.insertSnippet(
        new vscode.SnippetString(
          "\n" + indent + SNIPPET_CURSOR + "\n" + textAfterCursor.trimStart()
        ),
        new vscode.Range(
          new vscode.Position(position.line, position.character),
          new vscode.Position(position.line, Number.MAX_SAFE_INTEGER)
        )
      );
      return true;
    }
  }

  return false;
};

export const activateNewlineHelper = (
  context: vscode.ExtensionContext
): void => {
  try {
    const uri = getActiveSparkdownDocument();
    if (!uri) {
      return;
    }
    const config = getSparkdownPreviewConfig(uri);
    if (config.editor_newline_helper) {
      context.subscriptions.push(
        vscode.commands.registerCommand("type", (args) => {
          if (!handleNewline(args)) {
            vscode.commands.executeCommand("default:type", {
              text: args.text,
            });
          }
        })
      );
    }
  } catch {
    const moreDetails = "More details";
    const openGithub1 = "View issue on vscode repo";
    vscode.window
      .showInformationMessage(
        "Conflict with another extension! The 'type' command for vscode can only be registered by a single extension. You may want to disable the 'Parenthetical New Line Helper' setting in order to avoid further conflicts from Sparkdown",
        moreDetails,
        openGithub1
      )
      .then((val) => {
        switch (val) {
          case moreDetails: {
            vscode.env.openExternal(
              vscode.Uri.parse(
                "https://github.com/piersdeseilligny/betterfountain/issues/84"
              )
            );
            break;
          }
          case openGithub1: {
            vscode.env.openExternal(
              vscode.Uri.parse(
                "https://github.com/Microsoft/vscode/issues/13441"
              )
            );
            break;
          }
        }
      });
  }
};
