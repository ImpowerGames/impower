import { MessageProtocolRequestType } from "../../../../core/classes/MessageProtocolRequestType";
import { AudioData } from "../../types/AudioData";

export type AudioLoadMethod = typeof AudioLoadMessage.method;

export class AudioLoadMessage {
  static readonly method = "audio/load";
  static readonly type = new MessageProtocolRequestType<
    AudioLoadMethod,
    AudioData,
    string
  >(AudioLoadMessage.method);
}

export interface AudioLoadMessageMap extends Record<string, [any, any]> {
  [AudioLoadMessage.method]: [
    ReturnType<typeof AudioLoadMessage.type.request>,
    ReturnType<typeof AudioLoadMessage.type.response>
  ];
}
