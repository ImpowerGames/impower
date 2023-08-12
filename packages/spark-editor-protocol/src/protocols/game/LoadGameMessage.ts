import type { SparkProgram } from "../../../../sparkdown/src/types/SparkProgram";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type LoadGameMethod = typeof LoadGameMessage.method;

export interface LoadGameParams {
  programs: { uri: string; name: string; program: SparkProgram }[];
}

export namespace LoadGameMessage {
  export const method = "game/load";
  export const type = new MessageProtocolRequestType<
    LoadGameMethod,
    LoadGameParams,
    null
  >(LoadGameMessage.method);
}
