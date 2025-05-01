/*
 * Based on vscode-markdown <https://github.com/yzhang-gh/vscode-markdown>
 *
 * Copyright (c) 2017 张宇
 * Released under the MIT license.
 */

import {
  ExtensionContext,
  TextDocument,
  TextDocumentChangeEvent,
  window,
  workspace,
} from "vscode";
import { onDidChangeCodeLensesEmitter } from "../events/onDidChangeCodeLensesEmitter";
import { SparkdownDocumentManager } from "../managers/SparkdownDocumentManager";

export const activateDocumentManager = (context: ExtensionContext) => {
  const activeDocument = window.activeTextEditor?.document;
  if (activeDocument?.languageId === "sparkdown") {
    SparkdownDocumentManager.instance.add(activeDocument);
  }
  context.subscriptions.push(
    workspace.onDidOpenTextDocument((data: TextDocument) => {
      if (data.languageId === "sparkdown") {
        SparkdownDocumentManager.instance.add(data);
        onDidChangeCodeLensesEmitter.fire();
      }
    }),
    workspace.onDidChangeTextDocument((data: TextDocumentChangeEvent) => {
      if (data.document.languageId === "sparkdown") {
        SparkdownDocumentManager.instance.update(data);
        onDidChangeCodeLensesEmitter.fire();
      }
    }),
    workspace.onDidCloseTextDocument((data: TextDocument) => {
      if (data.languageId === "sparkdown") {
        SparkdownDocumentManager.instance.remove(data);
      }
    })
  );
};
