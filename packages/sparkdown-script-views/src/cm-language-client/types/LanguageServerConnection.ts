import {
  CancellationToken,
  Disposable,
  InitializeResult,
  NotificationHandler,
  ServerCapabilities,
} from "vscode-languageserver-protocol";

export interface LanguageServerConnection {
  name: string;
  id: string;
  serverCapabilities?: ServerCapabilities;
  starting?: Promise<InitializeResult>;
  start: () => Promise<InitializeResult>;
  stop: () => void;
  sendNotification: <P>(method: string, params?: P) => Promise<void>;
  sendRequest: <P, R>(
    method: string,
    params: P,
    token?: CancellationToken
  ) => Promise<R>;
  onNotification<P>(
    method: string,
    handler: NotificationHandler<P>
  ): Disposable;
}
