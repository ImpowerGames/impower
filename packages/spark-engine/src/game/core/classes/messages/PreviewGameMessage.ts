import { MessageProtocolRequestType } from "../../../../protocol/classes/MessageProtocolRequestType";
import { RequestMessage } from "../../../../protocol/types/RequestMessage";
import { ResponseMessage } from "../../../../protocol/types/ResponseMessage";

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
