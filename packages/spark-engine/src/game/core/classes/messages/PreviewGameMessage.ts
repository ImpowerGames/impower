import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import type { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";
import type { ResponseMessage } from "@impower/jsonrpc/src/common/types/ResponseMessage";
import type { ProgramAddress } from "@impower/sparkdown/src/compiler/types/ProgramAddress";

export type PreviewGameMethod = typeof PreviewGameMessage.method;

export interface PreviewGameParams {
  previewFrom: { file: string; line: number };
}

export interface PreviewGameResult {
  /** The address of the beat previewed, or null when the point resolves
   *  to none or the preview was taken over. */
  previewAddress: ProgramAddress | null;
}

export class PreviewGameMessage {
  static readonly method = "game/preview";
  static readonly type = new MessageProtocolRequestType<
    PreviewGameMethod,
    PreviewGameParams,
    PreviewGameResult
  >(PreviewGameMessage.method);
}

export namespace PreviewGameMessage {
  export interface Request extends RequestMessage<
    PreviewGameMethod,
    PreviewGameParams,
    PreviewGameResult
  > {}
  export type Response = ResponseMessage<PreviewGameMethod, PreviewGameResult>;
}
