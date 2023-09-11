import type { SparkContextOptions } from "../../../../spark-engine/src/parser/interfaces/SparkContextOptions";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type ConfigureGameMethod = typeof ConfigureGameMessage.method;

export interface ConfigureGameParams {
  settings: SparkContextOptions;
}

export class ConfigureGameMessage {
  static readonly method = "game/configure";
  static readonly type = new MessageProtocolRequestType<
    ConfigureGameMethod,
    ConfigureGameParams,
    null
  >(ConfigureGameMessage.method);
}
