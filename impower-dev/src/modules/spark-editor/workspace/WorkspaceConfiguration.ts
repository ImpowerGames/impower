import { sendProtocolMessage } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import {
  DidChangeConfigurationMessage,
  type DidChangeConfigurationParams,
} from "@impower/spark-editor-protocol/src/protocols/workspace/DidChangeConfigurationMessage";
import workspaceSettings, {
  type WorkspaceSettings,
} from "./settings/WorkspaceSettings";

export default class WorkspaceConfiguration {
  protected readonly _settings: WorkspaceSettings;

  constructor(settings: WorkspaceSettings = workspaceSettings) {
    this._settings = settings;
    settings.onDidChangeConfiguration((params) => {
      sendProtocolMessage(DidChangeConfigurationMessage.type.notification(params));
    });
  }

  get settings() {
    return this._settings.configuration.peek();
  }

  onDidChange(listener: (params: DidChangeConfigurationParams) => void) {
    return this._settings.onDidChangeConfiguration(listener);
  }
}
