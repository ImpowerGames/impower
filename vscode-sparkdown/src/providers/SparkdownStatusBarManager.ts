import { getRuntimeString } from "@impower/sparkdown/src/utils/getRuntimeString";
import * as vscode from "vscode";

export class SparkdownStatusBarManager {
  private static _instance: SparkdownStatusBarManager;
  static get instance(): SparkdownStatusBarManager {
    if (!this._instance) {
      this._instance = new SparkdownStatusBarManager();
    }
    return this._instance;
  }

  protected _statusBarItem?: vscode.StatusBarItem;
  get statusBarItem() {
    return this._statusBarItem;
  }

  showStatusBarItem() {
    if (!this._statusBarItem) {
      this._statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        100
      );
    }
    this._statusBarItem.show();
    return this._statusBarItem;
  }

  hideStatusBarItem() {
    if (this._statusBarItem) {
      this._statusBarItem.hide();
    }
  }

  updateStatusBarItem(lengthDialogue: number, lengthAction: number) {
    if (this._statusBarItem) {
      this._statusBarItem.show();
      const durationDialogue = lengthDialogue;
      const durationAction = lengthAction;
      this._statusBarItem.text = getRuntimeString(
        durationDialogue + durationAction
      );
      this._statusBarItem.tooltip =
        "Dialogue: " +
        getRuntimeString(durationDialogue) +
        "\nAction: " +
        getRuntimeString(durationAction);
    }
  }
}
