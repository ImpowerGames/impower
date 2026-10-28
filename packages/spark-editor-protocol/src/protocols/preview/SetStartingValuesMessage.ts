import type { RequestMessage } from "../../types/base/RequestMessage";
import type { ResponseMessage } from "../../types/base/ResponseMessage";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type SetStartingValuesMethod = typeof SetStartingValuesMessage.method;

/**
 * The values the Game Preview's routes start with, by start: a scene's
 * qualified name, or `"0"` for the top-level content. Each start's values
 * are by key (`param:hour`, `store:trust`, `visits:interrogation`,
 * `place:0:12:<uri>`, `seed`), each written as a literal (`"nine"`, `2`).
 */
export type StartingValuesParams = Record<string, Record<string, string>>;

/**
 * Every start's values, which the host keeps for the author in each project
 * and sends when a player connects and whenever they change, as the player
 * asked (`preview/changeStartingValues`) or an edit moved the line an
 * option's or an alternator's value is kept on. A player that never hears
 * one offers no Starting values tab.
 */
export interface SetStartingValuesParams {
  values: StartingValuesParams;
}

export interface SetStartingValuesResult {}

export class SetStartingValuesMessage {
  static readonly method = "preview/setStartingValues";
  static readonly type = new MessageProtocolRequestType<
    SetStartingValuesMethod,
    SetStartingValuesParams,
    SetStartingValuesResult
  >(SetStartingValuesMessage.method);
}

export namespace SetStartingValuesMessage {
  export interface Request extends RequestMessage<
    SetStartingValuesMethod,
    SetStartingValuesParams,
    SetStartingValuesResult
  > {}
  export type Response = ResponseMessage<
    SetStartingValuesMethod,
    SetStartingValuesResult
  >;
}
