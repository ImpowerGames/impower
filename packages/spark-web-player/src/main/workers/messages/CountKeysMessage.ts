import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import type { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";

export type CountKeysMethod = typeof CountKeysMessage.method;

export interface CountKeysParams {
  places: string;
}

export interface CountKeysResult {
  keys: Record<string, string>;
}

export class CountKeysMessage {
  static readonly method = "player/countKeys";
  static readonly type = new MessageProtocolRequestType<
    CountKeysMethod,
    CountKeysParams,
    CountKeysResult
  >(CountKeysMessage.method);
}

export namespace CountKeysMessage {
  export interface Request
    extends RequestMessage<CountKeysMethod, CountKeysParams, CountKeysResult> {}
}
