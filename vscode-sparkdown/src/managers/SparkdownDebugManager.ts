import {
  RollForwardDebugRequest,
  type RollDebugArguments,
} from "@impower/spark-editor-protocol/src/protocols/debug/RollDebugRequest";
import * as vscode from "vscode";

export const PINNED_STATE_KEY = "sparkdown.debug.pinned";

export const CAN_SKIP_FORWARD_KEY = "sparkdown.debug.canSkipForward";

export const skipForward = async (
  session: vscode.DebugSession | undefined,
) => {
  if (session?.type !== "game") {
    return;
  }
  const args: RollDebugArguments = { to: "beat" };
  try {
    await session.customRequest(RollForwardDebugRequest.command, args);
  } catch (e) {
    vscode.window.showInformationMessage(
      e instanceof Error ? e.message : String(e),
    );
  }
};

export class SparkdownDebugManager {
  private static _instance: SparkdownDebugManager;
  static get instance(): SparkdownDebugManager {
    return this._instance;
  }

  protected _syncCursorToExecution: boolean;
  get syncCursorToExecution() {
    return this._syncCursorToExecution;
  }
  set syncCursorToExecution(value) {
    this._syncCursorToExecution = value;
    this._context.globalState.update(PINNED_STATE_KEY, value);
    vscode.commands.executeCommand("setContext", PINNED_STATE_KEY, value);
  }

  protected _canSkipForward = false;

  setCanSkipForward(value: boolean) {
    if (value !== this._canSkipForward) {
      this._canSkipForward = value;
      vscode.commands.executeCommand("setContext", CAN_SKIP_FORWARD_KEY, value);
    }
  }

  static activate(context: vscode.ExtensionContext) {
    this._instance = new SparkdownDebugManager(context);
  }

  protected _context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    if (!SparkdownDebugManager._instance) {
      SparkdownDebugManager._instance = this;
    }

    this._context = context;

    this._syncCursorToExecution = context.globalState.get<boolean>(
      PINNED_STATE_KEY,
      true,
    );
    vscode.commands.executeCommand(
      "setContext",
      PINNED_STATE_KEY,
      this._syncCursorToExecution,
    );

    context.subscriptions.push(
      vscode.commands.registerCommand("sparkdown.debug.pin", () => {
        this.syncCursorToExecution = true;
      }),
    );

    context.subscriptions.push(
      vscode.commands.registerCommand("sparkdown.debug.unpin", () => {
        this.syncCursorToExecution = false;
      }),
    );

    context.subscriptions.push(
      vscode.commands.registerCommand("sparkdown.debug.skipForward", () =>
        skipForward(vscode.debug.activeDebugSession),
      ),
      vscode.debug.onDidTerminateDebugSession(() => {
        if (!vscode.debug.activeDebugSession) {
          this.setCanSkipForward(false);
        }
      }),
    );
  }
}
