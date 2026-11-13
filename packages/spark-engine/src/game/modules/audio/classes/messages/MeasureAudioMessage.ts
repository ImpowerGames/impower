import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import type { LoadAudioPlayerParams } from "../../types/LoadAudioPlayerParams";

export type MeasureAudioMethod = typeof MeasureAudioMessage.method;

export interface MeasureAudioParams {
  clips: LoadAudioPlayerParams[];
}

export interface MeasureAudioResult {
  durations: (number | null)[];
}

export class MeasureAudioMessage {
  static readonly method = "audio/measure";
  static readonly type = new MessageProtocolRequestType<
    MeasureAudioMethod,
    MeasureAudioParams,
    MeasureAudioResult
  >(MeasureAudioMessage.method);
}

export interface MeasureAudioMessageMap extends Record<string, [any, any]> {
  [MeasureAudioMessage.method]: [
    ReturnType<typeof MeasureAudioMessage.type.request>,
    ReturnType<typeof MeasureAudioMessage.type.response>,
  ];
}
