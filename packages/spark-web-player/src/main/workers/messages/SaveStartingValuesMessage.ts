import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import type { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";
import type { SaveSource } from "@impower/spark-engine/src/game/core/types/GameSave";
import type { StartingValueSet } from "@impower/sparkdown/src/program/startingValueLiterals";

export type SaveStartingValuesMethod = typeof SaveStartingValuesMessage.method;

export interface SaveStartingValuesParams {
  save: SaveSource;
  start: string;
}

export interface SaveStartingValuesResult {
  values: StartingValueSet;
}

export class SaveStartingValuesMessage {
  static readonly method = "player/saveStartingValues";
  static readonly type = new MessageProtocolRequestType<
    SaveStartingValuesMethod,
    SaveStartingValuesParams,
    SaveStartingValuesResult
  >(SaveStartingValuesMessage.method);
}

export namespace SaveStartingValuesMessage {
  export interface Request
    extends RequestMessage<SaveStartingValuesMethod, SaveStartingValuesParams, SaveStartingValuesResult> {}
}
