import { MessageProtocolRequestType } from "@impower/jsonrpc/src/classes/MessageProtocolRequestType";
import { RequestMessage } from "@impower/jsonrpc/src/types/RequestMessage";
import { ResponseMessage } from "@impower/jsonrpc/src/types/ResponseMessage";

export type ConfigureGameMethod = typeof ConfigureGameMessage.method;

export interface ConfigureGameParams {
  workspace?: string;
  simulateChoices?: Record<string, (number | undefined)[]> | null;
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
