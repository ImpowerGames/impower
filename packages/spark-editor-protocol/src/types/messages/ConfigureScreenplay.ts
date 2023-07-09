import { Message } from "../Message";
import { ScreenplayOptions } from "../ScreenplayOptions";
import { TextDocumentIdentifier } from "../TextDocumentIdentifier";

export interface ConfigureScreenplayParams {
  textDocument: TextDocumentIdentifier;
  options: ScreenplayOptions;
}

export type ConfigureScreenplayPreviewMethod =
  typeof ConfigureScreenplay.method;

export interface ConfigureScreenplayMessage
  extends Message<
    ConfigureScreenplayPreviewMethod,
    ConfigureScreenplayParams
  > {}

export class ConfigureScreenplay {
  static readonly method = "screenplay/configure";
  static is(obj: any): obj is ConfigureScreenplayMessage {
    return obj.method === this.method;
  }
  static message(
    params: ConfigureScreenplayParams
  ): ConfigureScreenplayMessage {
    return {
      method: this.method,
      params,
    };
  }
}
