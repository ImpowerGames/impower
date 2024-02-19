import { MessageProtocolRequestType } from "../../../../core/classes/MessageProtocolRequestType";
import { CameraUpdate } from "../../types/CameraUpdate";

export type DestroyCameraMethod = typeof DestroyCameraMessage.method;

export class DestroyCameraMessage {
  static readonly method = "world/destroycamera";
  static readonly type = new MessageProtocolRequestType<
    DestroyCameraMethod,
    CameraUpdate,
    string
  >(DestroyCameraMessage.method);
}

export interface DestroyCameraMessageMap extends Record<string, [any, any]> {
  [DestroyCameraMessage.method]: [
    ReturnType<typeof DestroyCameraMessage.type.request>,
    ReturnType<typeof DestroyCameraMessage.type.response>
  ];
}
