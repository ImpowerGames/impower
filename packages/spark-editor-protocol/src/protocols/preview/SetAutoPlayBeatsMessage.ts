import type { RequestMessage } from "../../types/base/RequestMessage";
import type { ResponseMessage } from "../../types/base/ResponseMessage";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type SetAutoPlayBeatsMethod = typeof SetAutoPlayBeatsMessage.method;

export interface SetAutoPlayBeatsParams {
  enabled: boolean;
}

export interface SetAutoPlayBeatsResult {}

export class SetAutoPlayBeatsMessage {
  static readonly method = "preview/setAutoPlayBeats";
  static readonly type = new MessageProtocolRequestType<
    SetAutoPlayBeatsMethod,
    SetAutoPlayBeatsParams,
    SetAutoPlayBeatsResult
  >(SetAutoPlayBeatsMessage.method);
}

export namespace SetAutoPlayBeatsMessage {
  export interface Request extends RequestMessage<
    SetAutoPlayBeatsMethod,
    SetAutoPlayBeatsParams,
    SetAutoPlayBeatsResult
  > {}
  export type Response = ResponseMessage<
    SetAutoPlayBeatsMethod,
    SetAutoPlayBeatsResult
  >;
}
