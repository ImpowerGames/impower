import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import type { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";
import type { ResponseMessage } from "@impower/jsonrpc/src/common/types/ResponseMessage";
import type { StartingValues } from "@impower/sparkdown/src/program/startingValueLiterals";

export type SetGameStartingValuesMethod =
  typeof SetGameStartingValuesMessage.method;

/** The values each start takes, by the start (a scene's qualified name, or
 *  `"0"` for the top-level content), every game the worker holds and builds
 *  starts its routes with. */
export interface SetGameStartingValuesParams {
  values: StartingValues;
}

export interface SetGameStartingValuesResult {}

export class SetGameStartingValuesMessage {
  static readonly method = "game/setStartingValues";
  static readonly type = new MessageProtocolRequestType<
    SetGameStartingValuesMethod,
    SetGameStartingValuesParams,
    SetGameStartingValuesResult
  >(SetGameStartingValuesMessage.method);
}

export namespace SetGameStartingValuesMessage {
  export interface Request extends RequestMessage<
    SetGameStartingValuesMethod,
    SetGameStartingValuesParams,
    SetGameStartingValuesResult
  > {}
  export type Response = ResponseMessage<
    SetGameStartingValuesMethod,
    SetGameStartingValuesResult
  >;
}
