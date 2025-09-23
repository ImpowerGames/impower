import { RequestMessage } from "../../types/base/RequestMessage";
import { ResponseMessage } from "../../types/base/ResponseMessage";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type ConfigureGameMethod = typeof ConfigureGameMessage.method;

export interface ConfigureGameParams {
  workspace?: string;
  simulateFrom?: { file: string; line: number } | null;
  simulateChoices?: Record<string, number[]> | null;
  startFrom?: { file: string; line: number };
}

export interface ConfigureGameResult {}

export class ConfigureGameMessage {
  static readonly method = "game/configure";
  static readonly type = new MessageProtocolRequestType<
    ConfigureGameMethod,
    ConfigureGameParams,
    ConfigureGameResult
  >(ConfigureGameMessage.method);
}

export namespace ConfigureGameMessage {
  export interface Request
    extends RequestMessage<
      ConfigureGameMethod,
      ConfigureGameParams,
      ConfigureGameResult
    > {}
  export interface Response
    extends ResponseMessage<ConfigureGameMethod, ConfigureGameResult> {}
}
