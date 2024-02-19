import { MessageProtocolRequestType } from "../../../../core/classes/MessageProtocolRequestType";
import { AudioUpdate } from "../../types/AudioUpdate";

export type AudioUpdateMethod = typeof AudioUpdateMessage.method;

export class AudioUpdateMessage {
  static readonly method = "audio/update";
  static readonly type = new MessageProtocolRequestType<
    AudioUpdateMethod,
    AudioUpdate[],
    string[]
  >(AudioUpdateMessage.method);
}

export interface AudioUpdateMessageMap extends Record<string, [any, any]> {
  [AudioUpdateMessage.method]: [
    ReturnType<typeof AudioUpdateMessage.type.request>,
    ReturnType<typeof AudioUpdateMessage.type.response>
  ];
}
