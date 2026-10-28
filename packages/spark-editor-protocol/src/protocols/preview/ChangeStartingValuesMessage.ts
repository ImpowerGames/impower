import type { RequestMessage } from "../../types/base/RequestMessage";
import type { ResponseMessage } from "../../types/base/ResponseMessage";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type ChangeStartingValuesMethod =
  typeof ChangeStartingValuesMessage.method;

/**
 * The author set or cleared starting values of one start in the Game
 * Preview's Starting values tab: each key given a literal is set to it, and
 * each key given null is cleared (Reset all clears every one). The host keeps
 * the change and sends every start's values back
 * (`preview/setStartingValues`); a change it answers with an error was not
 * kept, and the player puts the field back.
 */
export interface ChangeStartingValuesParams {
  start: string;
  changes: Record<string, string | null>;
}

export interface ChangeStartingValuesResult {}

export class ChangeStartingValuesMessage {
  static readonly method = "preview/changeStartingValues";
  static readonly type = new MessageProtocolRequestType<
    ChangeStartingValuesMethod,
    ChangeStartingValuesParams,
    ChangeStartingValuesResult
  >(ChangeStartingValuesMessage.method);
}

export namespace ChangeStartingValuesMessage {
  export interface Request extends RequestMessage<
    ChangeStartingValuesMethod,
    ChangeStartingValuesParams,
    ChangeStartingValuesResult
  > {}
  export type Response = ResponseMessage<
    ChangeStartingValuesMethod,
    ChangeStartingValuesResult
  >;
}
