import { Breakpoint } from "../../../../spark-engine/src/game/core/types/Breakpoint";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type ConfigureGameMethod = typeof ConfigureGameMessage.method;

export interface ConfigureGameParams {
  breakpoints?: { file: string; line: number }[];
  functionBreakpoints?: { name: string }[];
  startpoint?: { file: string; line: number };
}

export class ConfigureGameMessage {
  static readonly method = "game/configure";
  static readonly type = new MessageProtocolRequestType<
    ConfigureGameMethod,
    ConfigureGameParams,
    {
      breakpoints?: Breakpoint[];
      functionBreakpoints?: Breakpoint[];
    }
  >(ConfigureGameMessage.method);
}
