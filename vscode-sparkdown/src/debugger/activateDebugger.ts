/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/
/*
 * activateMockDebug.ts containes the shared extension code that can be executed both in node.js and the browser.
 */

"use strict";

import * as vscode from "vscode";
import {
  CancellationToken,
  DebugConfiguration,
  ProviderResult,
  WorkspaceFolder,
} from "vscode";
import { SparkdownPreviewGamePanelManager } from "../managers/SparkdownPreviewGamePanelManager";
import { getActiveOrVisibleEditor } from "../utils/getActiveOrVisibleEditor";
import { getEditor } from "../utils/getEditor";
import { FileAccessor, SparkDebugSession } from "./SparkDebugSession";

export const activateDebugger = (
  context: vscode.ExtensionContext,
  factory?: vscode.DebugAdapterDescriptorFactory
) => {
  context.subscriptions.push(
    vscode.commands.registerCommand("sparkdown.runGame", () => {
      if (SparkdownPreviewGamePanelManager.instance.document) {
        vscode.debug.startDebugging(
          undefined,
          {
            type: "game",
            name: "Run File",
            request: "launch",
            program:
              SparkdownPreviewGamePanelManager.instance.document.uri.fsPath,
          },
          { noDebug: true }
        );
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("sparkdown.debugGame", () => {
      if (SparkdownPreviewGamePanelManager.instance.document) {
        vscode.debug.startDebugging(undefined, {
          type: "game",
          name: "Debug File",
          request: "launch",
          program:
            SparkdownPreviewGamePanelManager.instance.document.uri.fsPath,
          stopOnEntry: true,
        });
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("sparkdown.getProgramName", (config) => {
      return vscode.window.showInputBox({
        placeHolder:
          "Please enter the name of a .sd file in the workspace folder",
        value: "main.sd",
      });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("sparkdown.getSaveName", (config) => {
      return vscode.window.showInputBox({
        placeHolder:
          "Please enter the name of a .sav file in the workspace folder",
        value: "main.sav",
      });
    })
  );

  // register a configuration provider for 'mock' debug type
  const provider = new MockConfigurationProvider();
  context.subscriptions.push(
    vscode.debug.registerDebugConfigurationProvider("game", provider)
  );

  // register a dynamic configuration provider for 'mock' debug type
  context.subscriptions.push(
    vscode.debug.registerDebugConfigurationProvider(
      "game",
      {
        provideDebugConfigurations(
          _folder: WorkspaceFolder | undefined
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
      vscode.DebugConfigurationProviderTriggerKind.Dynamic
    )
  );

  if (!factory) {
    factory = new InlineDebugAdapterFactory(context);
  }
  context.subscriptions.push(
    vscode.debug.registerDebugAdapterDescriptorFactory("game", factory)
  );
  if ("dispose" in factory) {
    context.subscriptions.push(factory as { dispose: () => any });
  }

  // override VS Code's default implementation of the debug hover
  // here we match only Mock "variables", that are words starting with an '$'
  context.subscriptions.push(
    vscode.languages.registerEvaluatableExpressionProvider("sparkdown", {
      provideEvaluatableExpression(
        document: vscode.TextDocument,
        position: vscode.Position
      ): vscode.ProviderResult<vscode.EvaluatableExpression> {
        const VARIABLE_REGEXP = /\$[a-z][a-z0-9]*/gi;
        const line = document.lineAt(position.line).text;

        let m: RegExpExecArray | null;
        while ((m = VARIABLE_REGEXP.exec(line))) {
          const varRange = new vscode.Range(
            position.line,
            m.index,
            position.line,
            m.index + m[0].length
          );

          if (varRange.contains(position)) {
            return new vscode.EvaluatableExpression(varRange);
          }
        }
        return undefined;
      },
    })
  );

  // override VS Code's default implementation of the "inline values" feature"
  context.subscriptions.push(
    vscode.languages.registerInlineValuesProvider("sparkdown", {
      provideInlineValues(
        document: vscode.TextDocument,
        viewport: vscode.Range,
        context: vscode.InlineValueContext
      ): vscode.ProviderResult<vscode.InlineValue[]> {
        const allValues: vscode.InlineValue[] = [];

        for (
          let l = viewport.start.line;
          l <= context.stoppedLocation.end.line;
          l++
        ) {
          const line = document.lineAt(l);
          var regExp = /\$([a-z][a-z0-9]*)/gi; // variables are words starting with '$'
          do {
            var m = regExp.exec(line.text);
            if (m) {
              const varName = m[1]!;
              const varRange = new vscode.Range(
                l,
                m.index,
                l,
                m.index + varName.length
              );

              // some literal text
              //allValues.push(new vscode.InlineValueText(varRange, `${varName}: ${viewport.start.line}`));

              // value found via variable lookup
              allValues.push(
                new vscode.InlineValueVariableLookup(varRange, varName, false)
              );

              // value determined via expression evaluation
              //allValues.push(new vscode.InlineValueEvaluatableExpression(varRange, varName));
            }
          } while (m);
        }

        return allValues;
      },
    })
  );
};

class MockConfigurationProvider implements vscode.DebugConfigurationProvider {
  /**
   * Massage a debug configuration just before a debug session is being launched,
   * e.g. add all missing attributes to the debug configuration.
   */
  resolveDebugConfiguration(
    folder: WorkspaceFolder | undefined,
    config: DebugConfiguration,
    token?: CancellationToken
  ): ProviderResult<DebugConfiguration> {
    // if launch.json is missing or empty
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
          return undefined; // abort launch
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
  try {
    return vscode.Uri.file(path);
  } catch (e) {
    return vscode.Uri.parse(path);
  }
}

class InlineDebugAdapterFactory
  implements vscode.DebugAdapterDescriptorFactory
{
  protected _context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this._context = context;
  }

  createDebugAdapterDescriptor(
    _session: vscode.DebugSession
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
            activeOrVisibleEditor.document
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
            vscode.TextEditorRevealType.InCenterIfOutsideViewport
          );
          await SparkdownPreviewGamePanelManager.instance.showPanel(
            context,
            activeOrVisibleEditor.document
          );
        }
      },
      pathToUri(path: string) {
        return pathToUri(path).toString();
      },
      uriToPath(uri: string) {
        return vscode.Uri.parse(uri).fsPath;
      },
      getRootPath(path: string) {
        const uri = pathToUri(path);
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
        if (workspaceFolder) {
          return workspaceFolder.uri.fsPath;
        }
        return undefined;
      },
    };

    return new vscode.DebugAdapterInlineImplementation(
      new SparkDebugSession(
        fileAccessor,
        SparkdownPreviewGamePanelManager.instance.connection
      )
    );
  }
}
