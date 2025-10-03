import { MessageProtocolRequestType } from "../../../../protocol/classes/MessageProtocolRequestType";
import { RequestMessage } from "../../../../protocol/types/RequestMessage";
import { ResponseMessage } from "../../../../protocol/types/ResponseMessage";

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
