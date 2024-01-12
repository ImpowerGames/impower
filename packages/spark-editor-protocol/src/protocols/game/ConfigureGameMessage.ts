import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type ConfigureGameMethod = typeof ConfigureGameMessage.method;

export interface ConfigureGameParams {
  settings: {
    simulateFromProgram?: string;
    simulateFromLine?: number;
    startFromProgram?: string;
    startFromLine?: number;
  };
}

export class ConfigureGameMessage {
  static readonly method = "game/configure";
  static readonly type = new MessageProtocolRequestType<
    ConfigureGameMethod,
    ConfigureGameParams,
    null
  >(ConfigureGameMessage.method);
}
