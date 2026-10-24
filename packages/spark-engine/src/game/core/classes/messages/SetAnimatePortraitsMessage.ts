import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import type { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";
import type { ResponseMessage } from "@impower/jsonrpc/src/common/types/ResponseMessage";

export type SetAnimatePortraitsMethod = typeof SetAnimatePortraitsMessage.method;

/**
 * The editor's `Animate portraits` preference. Off returns every portrait
 * morph to its rest pose and keeps it there; on starts each one on a fresh
 * cycle. It holds for whatever the player shows, stopped or playing, until
 * the editor sends it again; the player starts with it on.
 */
export interface SetAnimatePortraitsParams {
  enabled: boolean;
}

export interface SetAnimatePortraitsResult {}

export class SetAnimatePortraitsMessage {
  static readonly method = "game/setAnimatePortraits";
  static readonly type = new MessageProtocolRequestType<
    SetAnimatePortraitsMethod,
    SetAnimatePortraitsParams,
    SetAnimatePortraitsResult
  >(SetAnimatePortraitsMessage.method);
}

export namespace SetAnimatePortraitsMessage {
  export interface Request extends RequestMessage<
    SetAnimatePortraitsMethod,
    SetAnimatePortraitsParams,
    SetAnimatePortraitsResult
  > {}
  export type Response = ResponseMessage<
    SetAnimatePortraitsMethod,
    SetAnimatePortraitsResult
  >;
}
