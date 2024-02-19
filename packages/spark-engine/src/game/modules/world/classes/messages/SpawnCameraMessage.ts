import { MessageProtocolRequestType } from "../../../../core/classes/MessageProtocolRequestType";
import { CameraUpdate } from "../../types/CameraUpdate";

export type SpawnCameraMethod = typeof SpawnCameraMessage.method;

export class SpawnCameraMessage {
  static readonly method = "world/spawncamera";
  static readonly type = new MessageProtocolRequestType<
    SpawnCameraMethod,
    CameraUpdate,
    string
  >(SpawnCameraMessage.method);
}

export interface SpawnCameraMessageMap extends Record<string, [any, any]> {
  [SpawnCameraMessage.method]: [
    ReturnType<typeof SpawnCameraMessage.type.request>,
    ReturnType<typeof SpawnCameraMessage.type.response>
  ];
}
