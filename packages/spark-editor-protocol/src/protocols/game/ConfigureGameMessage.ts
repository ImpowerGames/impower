import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type ConfigureGameMethod = typeof ConfigureGameMessage.method;

export interface ConfigureGameParams {
  settings: {
    waypoints?: { uri: string; line: number }[];
    startpoint?: { uri: string; line: number };
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
