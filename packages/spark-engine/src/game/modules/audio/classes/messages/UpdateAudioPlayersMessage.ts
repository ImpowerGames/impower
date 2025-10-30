import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import { UpdateAudioPlayersParams } from "../../types/UpdateAudioPlayersParams";

export type UpdateAudioPlayersMethod = typeof UpdateAudioPlayersMessage.method;

export class UpdateAudioPlayersMessage {
  static readonly method = "audio/update";
  static readonly type = new MessageProtocolRequestType<
    UpdateAudioPlayersMethod,
    UpdateAudioPlayersParams,
    UpdateAudioPlayersParams
  >(UpdateAudioPlayersMessage.method);
}

export interface UpdateAudioPlayersMessageMap
  extends Record<string, [any, any]> {
  [UpdateAudioPlayersMessage.method]: [
    ReturnType<typeof UpdateAudioPlayersMessage.type.request>,
    ReturnType<typeof UpdateAudioPlayersMessage.type.response>
  ];
}
