import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type DroppedFilesMethod = typeof DroppedFilesMessage.method;

export type DroppedFilesParams = {
  files: { name: string; buffer: ArrayBuffer }[];
};

export class DroppedFilesMessage {
  static readonly method = "window/dropFiles";
  static readonly type = new MessageProtocolNotificationType<
    DroppedFilesMethod,
    DroppedFilesParams
  >(DroppedFilesMessage.method);
}
