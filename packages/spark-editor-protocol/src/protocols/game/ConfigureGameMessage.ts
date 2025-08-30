import { Breakpoint } from "../../../../spark-engine/src/game/core/types/Breakpoint";
import { RequestMessage } from "../../types/base/RequestMessage";
import { ResponseMessage } from "../../types/base/ResponseMessage";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type ConfigureGameMethod = typeof ConfigureGameMessage.method;

export interface ConfigureGameParams {
  workspace?: string;
  simulateFrom?: { file: string; line: number };
  startFrom?: { file: string; line: number };
  breakpoints?: { file: string; line: number }[];
  functionBreakpoints?: { name: string }[];
  dataBreakpoints?: { dataId: string }[];
}

export interface ConfigureGameResult {
  breakpoints?: Breakpoint[];
  functionBreakpoints?: Breakpoint[];
  dataBreakpoints?: Breakpoint[];
}

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
