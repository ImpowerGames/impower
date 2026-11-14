import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import type { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";

export type SetPreviewAudioMethod = typeof SetPreviewAudioMessage.method;

export interface SetPreviewAudioParams {
  enabled: boolean;
}

export class SetPreviewAudioMessage {
  static readonly method = "player/setPreviewAudio";
  static readonly type = new MessageProtocolRequestType<
    SetPreviewAudioMethod,
    SetPreviewAudioParams,
    {}
  >(SetPreviewAudioMessage.method);
}

export namespace SetPreviewAudioMessage {
  export interface Request extends RequestMessage<
    SetPreviewAudioMethod,
    SetPreviewAudioParams,
    {}
  > {}
}
