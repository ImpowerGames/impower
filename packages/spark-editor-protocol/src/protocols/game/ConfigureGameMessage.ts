import type { SparkContextOptions } from "../../../../spark-engine/src/parser/interfaces/SparkContextOptions";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type ConfigureGameMethod = typeof ConfigureGameMessage.method;

export interface ConfigureGameParams {
  settings: SparkContextOptions;
}

export namespace ConfigureGameMessage {
  export const method = "game/configure";
  export const type = new MessageProtocolRequestType<
    ConfigureGameMethod,
    ConfigureGameParams,
    null
  >(ConfigureGameMessage.method);
}
