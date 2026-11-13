import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";

export type SpeechMeasuredMethod = typeof SpeechMeasuredMessage.method;

export interface SpeechMeasuredParams {
  end: number;
}

export class SpeechMeasuredMessage {
  static readonly method = "morph/speechMeasured";
  static readonly type = new MessageProtocolNotificationType<
    SpeechMeasuredMethod,
    SpeechMeasuredParams
  >(SpeechMeasuredMessage.method);
}
