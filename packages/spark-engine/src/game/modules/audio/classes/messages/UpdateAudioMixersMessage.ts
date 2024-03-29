import { MessageProtocolRequestType } from "../../../../core/classes/MessageProtocolRequestType";
import { UpdateAudioMixersParams } from "../../types/UpdateAudioMixersParams";

export type UpdateAudioMixersMethod = typeof UpdateAudioMixersMessage.method;

export class UpdateAudioMixersMessage {
  static readonly method = "audio/updateMixers";
  static readonly type = new MessageProtocolRequestType<
    UpdateAudioMixersMethod,
    UpdateAudioMixersParams,
    string[]
  >(UpdateAudioMixersMessage.method);
}

export interface UpdateAudioMixersMessageMap
  extends Record<string, [any, any]> {
  [UpdateAudioMixersMessage.method]: [
    ReturnType<typeof UpdateAudioMixersMessage.type.request>,
    ReturnType<typeof UpdateAudioMixersMessage.type.response>
  ];
}
