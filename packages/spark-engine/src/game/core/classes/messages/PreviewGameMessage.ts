import { MessageProtocolRequestType } from "@impower/jsonrpc/src/classes/MessageProtocolRequestType";
import { RequestMessage } from "@impower/jsonrpc/src/types/RequestMessage";
import { ResponseMessage } from "@impower/jsonrpc/src/types/ResponseMessage";

export type PreviewGameMethod = typeof PreviewGameMessage.method;

export interface PreviewGameParams {
  previewFrom: { file: string; line: number };
}

export interface PreviewGameResult {
  previewPath: string;
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
  export interface Request
    extends RequestMessage<
      PreviewGameMethod,
      PreviewGameParams,
      PreviewGameResult
    > {}
  export interface Response
    extends ResponseMessage<PreviewGameMethod, PreviewGameResult> {}
}
