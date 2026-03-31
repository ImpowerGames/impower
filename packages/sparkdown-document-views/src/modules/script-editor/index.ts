import { type MessageConnection } from "vscode-languageserver-protocol";
import { DefineOptions } from "../../../../spec-component/src/component";
import Main from "./main/sparkdown-script-editor";

interface InitOptions extends DefineOptions {
  tag?: string;
  languageServerWorker: Worker;
  languageServerConnection: MessageConnection;
}

export default abstract class SparkdownScriptEditor {
  static async init(options: InitOptions) {
    const name = options?.tag ?? Main.tag;
    Main.languageServerWorker = options.languageServerWorker;
    Main.languageServerConnection = options.languageServerConnection;
    if (!customElements.get(name)) {
      customElements.define(name, Main);
    }
    return customElements.whenDefined(name);
  }
}
