import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import type { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";

export type SaveRefusalsMethod = typeof SaveRefusalsMessage.method;

export interface SaveRefusalsParams {
  saves: { id: string; data: string }[];
}

export interface SaveRefusalsResult {
  refusals: Record<string, string>;
}

export class SaveRefusalsMessage {
  static readonly method = "player/saveRefusals";
  static readonly type = new MessageProtocolRequestType<
    SaveRefusalsMethod,
    SaveRefusalsParams,
    SaveRefusalsResult
  >(SaveRefusalsMessage.method);
}

export namespace SaveRefusalsMessage {
  export interface Request
    extends RequestMessage<
      SaveRefusalsMethod,
      SaveRefusalsParams,
      SaveRefusalsResult
    > {}
}
