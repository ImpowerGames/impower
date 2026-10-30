/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

"use strict";

import * as vscode from "vscode";
import {
  CancellationToken,
  DebugConfiguration,
  ProviderResult,
  WorkspaceFolder,
} from "vscode";
import { SparkdownDebugManager } from "../managers/SparkdownDebugManager";
import { SparkdownPreviewGamePanelManager } from "../managers/SparkdownPreviewGamePanelManager";
import { getActiveOrVisibleEditor } from "../utils/getActiveOrVisibleEditor";
import { getEditor } from "../utils/getEditor";
import { FileAccessor, SparkDebugSession } from "./SparkDebugSession";
import { debugPathToUri, debugUriToPath } from "./debugUriMapping";
import { evaluatableExpressionRange } from "./evaluatableExpressionRange";

export const activateDebugger = (
  context: vscode.ExtensionContext,
  factory?: vscode.DebugAdapterDescriptorFactory,
) => {
  SparkdownDebugManager.activate(context);

  context.subscriptions.push(
    vscode.commands.registerCommand("sparkdown.runGame", () => {
      if (SparkdownPreviewGamePanelManager.instance.document) {
        SparkdownDebugManager.instance.syncCursorToExecution = true;
        vscode.debug.startDebugging(
          undefined,
          {
            type: "game",
            name: "Run File",
            request: "launch",
            program: debugUriToPath(
              vscode.Uri,
              SparkdownPreviewGamePanelManager.instance.document.uri.toString(),
            ),
          },
          { noDebug: true },
        );
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("sparkdown.debugGame", () => {
      if (SparkdownPreviewGamePanelManager.instance.document) {
        SparkdownDebugManager.instance.syncCursorToExecution = true;
        vscode.debug.startDebugging(undefined, {
          type: "game",
          name: "Debug File",
          request: "launch",
          program: debugUriToPath(
            vscode.Uri,
            SparkdownPreviewGamePanelManager.instance.document.uri.toString(),
          ),
          stopOnEntry: true,
        });
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("sparkdown.getProgramName", () => {
      return vscode.window.showInputBox({
        placeHolder:
          "Please enter the name of a .sd file in the workspace folder",
        value: "main.sd",
      });
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("sparkdown.getSaveName", () => {
      return vscode.window.showInputBox({
        placeHolder:
          "Please enter the name of a .sav file in the workspace folder",
        value: "main.sav",
      });
    }),
  );

  const provider = new MockConfigurationProvider();
  context.subscriptions.push(
    vscode.debug.registerDebugConfigurationProvider("game", provider),
  );

  context.subscriptions.push(
    vscode.debug.registerDebugConfigurationProvider(
      "game",
      {
        provideDebugConfigurations(
          _folder: WorkspaceFolder | undefined,
        ): ProviderResult<DebugConfiguration[]> {
          return [
            {
              name: "Dynamic Launch",
              request: "launch",
              type: "game",
              program: "${file}",
            },
            {
              name: "Another Dynamic Launch",
              request: "launch",
              type: "game",
              program: "${file}",
            },
            {
              name: "Mock Launch",
              request: "launch",
              type: "game",
              program: "${file}",
            },
          ];
        },
      },
      vscode.DebugConfigurationProviderTriggerKind.Dynamic,
    ),
  );

  if (!factory) {
    factory = new InlineDebugAdapterFactory(context);
  }
  context.subscriptions.push(
    vscode.debug.registerDebugAdapterDescriptorFactory("game", factory),
  );
  if ("dispose" in factory) {
    context.subscriptions.push(factory as { dispose: () => any });
  }

  context.subscriptions.push(
    vscode.languages.registerEvaluatableExpressionProvider("sparkdown", {
      provideEvaluatableExpression(
        document: vscode.TextDocument,
        position: vscode.Position,
      ): vscode.ProviderResult<vscode.EvaluatableExpression> {
        const line = document.lineAt(position.line).text;
        const range = evaluatableExpressionRange(line, position.character);
        if (!range) {
          return undefined;
        }
        return new vscode.EvaluatableExpression(
          new vscode.Range(position.line, range.start, position.line, range.end),
        );
      },
    }),
  );

  context.subscriptions.push(
    vscode.languages.registerInlineValuesProvider("sparkdown", {
      provideInlineValues(
        document: vscode.TextDocument,
        viewport: vscode.Range,
        context: vscode.InlineValueContext,
      ): vscode.ProviderResult<vscode.InlineValue[]> {
        const allValues: vscode.InlineValue[] = [];

        for (
          let l = viewport.start.line;
          l <= context.stoppedLocation.end.line;
          l++
        ) {
          const line = document.lineAt(l);
          var regExp = /\$([a-z][a-z0-9]*)/gi;
          do {
            var m = regExp.exec(line.text);
            if (m) {
              const varName = m[1]!;
              const varRange = new vscode.Range(
                l,
                m.index,
                l,
                m.index + varName.length,
              );

              allValues.push(
                new vscode.InlineValueVariableLookup(varRange, varName, false),
              );

            }
          } while (m);
        }

        return allValues;
      },
    }),
  );
};

class MockConfigurationProvider implements vscode.DebugConfigurationProvider {
  resolveDebugConfiguration(
    _folder: WorkspaceFolder | undefined,
    config: DebugConfiguration,
    _token?: CancellationToken,
  ): ProviderResult<DebugConfiguration> {
    if (!config.type && !config.request && !config.name) {
      const editor = getActiveOrVisibleEditor();
      if (editor && editor.document.languageId === "sparkdown") {
        config.type = "game";
        config.name = "Launch";
        config.request = "launch";
        config["program"] = "${file}";
        config["stopOnEntry"] = true;
      }
    }

    if (!config["program"]) {
      return vscode.window
        .showInformationMessage("Cannot find a program to debug")
        .then((_) => {
          return undefined;
        });
    }

    return config;
  }
}

function pathToUri(path: string): vscode.Uri {
  if (path.startsWith("webview-panel\\")) {
    const docUri = SparkdownPreviewGamePanelManager.instance.document?.uri;
    if (docUri) {
      return docUri;
    }
  }
  const knownUris = vscode.workspace.textDocuments.map((d) =>
    d.uri.toString(),
  );
  const rootUris = (vscode.workspace.workspaceFolders ?? []).map((f) =>
    f.uri.toString(),
  );
  return vscode.Uri.parse(
    debugPathToUri(vscode.Uri, path, knownUris, rootUris),
  );
}

class InlineDebugAdapterFactory
  implements vscode.DebugAdapterDescriptorFactory
{
  protected _context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this._context = context;
  }

  createDebugAdapterDescriptor(
    _session: vscode.DebugSession,
  ): ProviderResult<vscode.DebugAdapterDescriptor> {
    const context = this._context;

    const fileAccessor: FileAccessor = {
      isWindows: typeof process !== "undefined" && process.platform === "win32",
      async readFile(path: string): Promise<Uint8Array> {
        let uri: vscode.Uri;
        try {
          uri = pathToUri(path);
        } catch (e) {
          return new TextEncoder().encode(`cannot read '${path}'`);
        }
        return await vscode.workspace.fs.readFile(uri);
      },
      async writeFile(path: string, contents: Uint8Array) {
        await vscode.workspace.fs.writeFile(pathToUri(path), contents);
      },
      async showFile(path: string) {
        const docUri = pathToUri(path);
        const activeOrVisibleEditor = getActiveOrVisibleEditor();
        if (
          activeOrVisibleEditor?.document.uri.toString() === docUri.toString()
        ) {
          await SparkdownPreviewGamePanelManager.instance.showPanel(
            context,
            activeOrVisibleEditor.document,
          );
        }
      },
      async getSelectedLine(path: string) {
        const docUri = pathToUri(path);
        const editor = getEditor(docUri);
        return editor?.selection.active.line;
      },
      async revealLine(path: string, line: number) {
        const docUri = pathToUri(path);
        const activeOrVisibleEditor = getActiveOrVisibleEditor();
        const range = new vscode.Range(line, 0, line, 0);
        if (
          activeOrVisibleEditor?.document.uri.toString() === docUri.toString()
        ) {
          activeOrVisibleEditor.revealRange(
            range,
            vscode.TextEditorRevealType.InCenterIfOutsideViewport,
          );
          await SparkdownPreviewGamePanelManager.instance.showPanel(
            context,
            activeOrVisibleEditor.document,
          );
        }
      },
      isActiveTextEditor(path: string) {
        const docUri = pathToUri(path);
        return (
          vscode.window.activeTextEditor?.document.uri.toString() ===
          docUri.toString()
        );
      },
      pathToUri(path: string) {
        return pathToUri(path).toString();
      },
      uriToPath(uri: string) {
        return debugUriToPath(vscode.Uri, uri);
      },
      getRootPath(path: string) {
        const uri = pathToUri(path);
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
        if (workspaceFolder) {
          return debugUriToPath(vscode.Uri, workspaceFolder.uri.toString());
        }
        return undefined;
      },
    };

    return new vscode.DebugAdapterInlineImplementation(
      new SparkDebugSession(
        fileAccessor,
        SparkdownPreviewGamePanelManager.instance.connection,
      ),
    );
  }
}
